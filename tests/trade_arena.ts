// ═══════════════════════════════════════════════════════════════════════════
// Trade Arena — Devnet Integration Test
// ═══════════════════════════════════════════════════════════════════════════
//
// HOW TO RUN
// ──────────
//   1. anchor build --features testing   ← relaxed duration / commit-window
//   2. anchor deploy --provider.cluster devnet
//   3. yarn install
//   4. ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//      ANCHOR_WALLET=~/.config/solana/id.json \
//      yarn test
//
// WHAT THIS TESTS (full game loop)
// ─────────────────────────────────
//   create_game  →  join × 2  →  delegate_player × 2  →  delegate_game
//   → start_game (ER)  →  trade_position × N (ER)  →  end_game (ER)
//   → commit_game (ER)  →  claim_prize
//
// KEY CONCEPTS
// ─────────────
//   • Two Solana connections are used throughout:
//       provider.connection   — Devnet (base layer, ~400 ms finality)
//       erConnection          — MagicBlock ER  (~10-50 ms finality)
//   • Instructions that touch delegated accounts (trade/end/commit)
//     MUST be sent to the ER endpoint, not devnet.
//   • ER transactions require manual blockhash + feePayer setup because
//     the ER is a separate validator with its own recent-blockhash queue.
//   • skipPreflight: true is required for ER sends — the ER validator
//     doesn't expose the same simulation API as a standard RPC node.
// ═══════════════════════════════════════════════════════════════════════════

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TradeArena } from "../target/types/trade_arena";
import { createHash } from "crypto";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  createTopUpEscrowInstruction,
  escrowPdaFromEscrowAuthority,
  GetCommitmentSignature,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { expect } from "chai";

// ── Constants ────────────────────────────────────────────────────────────────

// Pyth Lazer BTC/USD feed on MagicBlock ER.
// The on-chain parser expects the PriceUpdateV2 layout used by the live
// Lazer feed, so this harness uses the same feed as the simulation test.
const PYTH_LAZER_BTC_USD = new anchor.web3.PublicKey(
  "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr"
);

// MagicBlock infrastructure accounts — IDs come from the SDK.
const DELEGATION_PROGRAM_ID = new anchor.web3.PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

// MagicBlock devnet ephemeral-rollup RPC endpoint.
const ER_ENDPOINT = "https://devnet.magicblock.app/";
const SESSION_KEYS_PROGRAM_ID = new anchor.web3.PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);

// PDA seeds (must match the Rust constants exactly)
const GAME_SEED = Buffer.from("game");
const PLAYER_SEED = Buffer.from("player");
const VAULT_SEED = Buffer.from("vault");
const SESSION_TOKEN_SEED = Buffer.from("session_token");

type ParsedPlayerState = {
  virtualUsdc: bigint;
  positionSize: bigint;
  sideFlag: number;
  entryPrice: bigint;
  realizedPnl: bigint;
};

// ── PDA helpers ──────────────────────────────────────────────────────────────

/** Encode a game_id (u64) as little-endian 8 bytes — matches Rust to_le_bytes() */
function u64Le(n: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

function findGamePDA(
  creator: anchor.web3.PublicKey,
  gameId: number,
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [GAME_SEED, creator.toBuffer(), u64Le(gameId)],
    programId
  );
}

function findPlayerStatePDA(
  game: anchor.web3.PublicKey,
  player: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [PLAYER_SEED, game.toBuffer(), player.toBuffer()],
    programId
  );
}

function findVaultPDA(
  game: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
): [anchor.web3.PublicKey, number] {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [VAULT_SEED, game.toBuffer()],
    programId
  );
}

function findSessionTokenPDA(
  targetProgram: anchor.web3.PublicKey,
  sessionSigner: anchor.web3.PublicKey,
  authority: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      SESSION_TOKEN_SEED,
      targetProgram.toBuffer(),
      sessionSigner.toBuffer(),
      authority.toBuffer(),
    ],
    SESSION_KEYS_PROGRAM_ID
  )[0];
}

// Delegation PDAs — all derived from the delegation program.
// These are passed as extra accounts when calling delegate_player.
function findBufferPDA(account: anchor.web3.PublicKey): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), account.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

function findDelegationRecordPDA(
  account: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-record"), account.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

function findDelegationMetadataPDA(
  account: anchor.web3.PublicKey
): anchor.web3.PublicKey {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), account.toBuffer()],
    DELEGATION_PROGRAM_ID
  )[0];
}

// ── ER transaction helper ────────────────────────────────────────────────────
//
// ER transactions can't just call .rpc() — we need to:
//   1. Build the Transaction object with .transaction()
//   2. Set feePayer  (who pays gas on the ER — we use the creator wallet)
//   3. Set recentBlockhash from the ER's own blockhash queue
//   4. partialSign with any instruction signers (e.g. player keypairs)
//   5. Sign the whole tx with the fee-payer wallet
//   6. sendRawTransaction with skipPreflight: true
//
async function sendToER(
  erConn: anchor.web3.Connection,
  feePayerWallet: anchor.Wallet,
  tx: anchor.web3.Transaction,
  instructionSigners: anchor.web3.Keypair[] = []
): Promise<string> {
  tx.feePayer = feePayerWallet.publicKey;
  const { blockhash } = await erConn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  // Instruction signers sign first (they're not the fee payer)
  for (const kp of instructionSigners) {
    tx.partialSign(kp);
  }

  // Fee payer (creator wallet) adds its signature
  const signedTx = await feePayerWallet.signTransaction(tx);

  return erConn.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: true,
  });
}

async function sendPlayerToER(
  erConn: anchor.web3.Connection,
  player: anchor.web3.Keypair,
  tx: anchor.web3.Transaction
): Promise<string> {
  tx.feePayer = player.publicKey;
  const { blockhash } = await erConn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(player);

  return erConn.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });
}

async function confirmERSuccess(
  erConn: anchor.web3.Connection,
  sig: string
): Promise<void> {
  await erConn.confirmTransaction(sig, "confirmed");

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const statuses = await erConn.getSignatureStatuses([sig]);
    const status = statuses.value[0];
    if (status?.confirmationStatus) {
      expect(status.err, `ER transaction ${sig} failed`).to.be.null;
      return;
    }
    await sleep(250);
  }

  throw new Error(`timed out fetching ER status for ${sig}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForBaseAccount(
  baseConnection: anchor.web3.Connection,
  account: anchor.web3.PublicKey,
  label: string,
  timeoutMs = 60_000
): Promise<anchor.web3.AccountInfo<Buffer>> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const info = await baseConnection.getAccountInfo(account, "confirmed");
    if (info) return info;
    await sleep(1_000);
  }

  throw new Error(`${label} did not appear on base layer in time`);
}

async function waitForOwner(
  connection: anchor.web3.Connection,
  account: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey,
  timeoutMs = 60_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await connection.getAccountInfo(account, "confirmed");
    if (info?.owner.equals(owner)) return;
    await sleep(1_000);
  }

  throw new Error(
    `${account.toBase58()} did not return to owner ${owner.toBase58()}`
  );
}

async function ownerMatches(
  connection: anchor.web3.Connection,
  account: anchor.web3.PublicKey,
  owner: anchor.web3.PublicKey,
  timeoutMs = 60_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const info = await connection.getAccountInfo(account, "confirmed");
    if (info?.owner.equals(owner)) return true;
    await sleep(1_000);
  }

  return false;
}

async function finalizeUndelegationOnBase(args: {
  program: Program<TradeArena>;
  baseConnection: anchor.web3.Connection;
  erConnection: anchor.web3.Connection;
  payer: anchor.web3.PublicKey;
  programId: anchor.web3.PublicKey;
  baseAccount: anchor.web3.PublicKey;
  accountSeeds: Buffer[];
  erScheduleSig: string;
}): Promise<string | null> {
  const {
    program,
    baseConnection,
    erConnection,
    payer,
    programId,
    baseAccount,
    accountSeeds,
    erScheduleSig,
  } = args;
  const buffer = findBufferPDA(baseAccount);
  let baseCommitSig: string | null = null;
  try {
    baseCommitSig = await GetCommitmentSignature(erScheduleSig, erConnection);
    await baseConnection.confirmTransaction(baseCommitSig, "confirmed");
  } catch {}

  if (await ownerMatches(baseConnection, baseAccount, programId, 30_000)) {
    return baseCommitSig;
  }

  await waitForBaseAccount(
    baseConnection,
    buffer,
    "undelegation buffer",
    180_000
  );

  await program.methods
    .processUndelegation(accountSeeds)
    .accounts({
      baseAccount,
      buffer,
      payer,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  await waitForOwner(baseConnection, baseAccount, programId);
  return baseCommitSig;
}

async function createSessionToken(args: {
  provider: anchor.AnchorProvider;
  authority: anchor.web3.Keypair;
  sessionSigner: anchor.web3.Keypair;
  targetProgram: anchor.web3.PublicKey;
  validUntil: number;
  lamports?: number;
}): Promise<anchor.web3.PublicKey> {
  const { provider, authority, sessionSigner, targetProgram, validUntil } = args;
  const lamports = args.lamports ?? 5_000_000;
  const sessionToken = findSessionTokenPDA(
    targetProgram,
    sessionSigner.publicKey,
    authority.publicKey
  );
  const discriminator = createHash("sha256")
    .update("global:create_session")
    .digest()
    .subarray(0, 8);
  const ix = new anchor.web3.TransactionInstruction({
    programId: SESSION_KEYS_PROGRAM_ID,
    keys: [
      { pubkey: sessionToken, isSigner: false, isWritable: true },
      { pubkey: sessionSigner.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: targetProgram, isSigner: false, isWritable: false },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    data: Buffer.concat([
      discriminator,
      Buffer.from([1, 1]),
      Buffer.from([1]),
      new BN(validUntil).toArrayLike(Buffer, "le", 8),
      Buffer.from([1]),
      new BN(lamports).toArrayLike(Buffer, "le", 8),
    ]),
  });

  await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix), [
    sessionSigner,
    authority,
  ]);

  await waitForBaseAccount(
    provider.connection,
    sessionToken,
    "session token account"
  );
  return sessionToken;
}

function parsePlayerStateBuffer(data: Buffer): ParsedPlayerState | null {
  if (data.length < 106) return null;

  let offset = 8 + 32 + 32;
  const virtualUsdc = data.readBigUInt64LE(offset);
  offset += 8;
  const positionSize = data.readBigUInt64LE(offset);
  offset += 8;
  const sideFlag = data[offset];
  offset += 1;
  const entryPrice = data.readBigUInt64LE(offset);
  offset += 8;
  const realizedPnl = data.readBigInt64LE(offset);

  if (virtualUsdc === 0n) return null;

  return { virtualUsdc, positionSize, sideFlag, entryPrice, realizedPnl };
}

function parseGameStartTime(data: Buffer): number {
  return Number(data.readBigInt64LE(96));
}

async function fetchDelegatedPlayerState(
  conn: anchor.web3.Connection,
  playerState: anchor.web3.PublicKey
): Promise<ParsedPlayerState> {
  const account = await conn.getAccountInfo(playerState, "confirmed");
  expect(account, `missing PlayerState ${playerState.toBase58()}`).to.not.be
    .null;
  if (!account) {
    throw new Error(`missing PlayerState ${playerState.toBase58()}`);
  }

  const parsed = parsePlayerStateBuffer(Buffer.from(account.data));
  expect(parsed, `failed to decode PlayerState ${playerState.toBase58()}`).to
    .not.be.null;
  if (!parsed) {
    throw new Error(`failed to decode PlayerState ${playerState.toBase58()}`);
  }

  return parsed;
}

async function fetchPlayerStateFromAnyLayer(
  erConnection: anchor.web3.Connection,
  baseConnection: anchor.web3.Connection,
  playerState: anchor.web3.PublicKey
): Promise<ParsedPlayerState> {
  for (const conn of [erConnection, baseConnection]) {
    const account = await conn.getAccountInfo(playerState, "confirmed");
    if (!account) continue;
    const parsed = parsePlayerStateBuffer(Buffer.from(account.data));
    if (parsed) return parsed;
  }

  throw new Error(`missing PlayerState ${playerState.toBase58()}`);
}

async function waitForDelegatedPlayerState(
  erConnection: anchor.web3.Connection,
  baseConnection: anchor.web3.Connection,
  playerState: anchor.web3.PublicKey,
  predicate: (state: ParsedPlayerState) => boolean,
  timeoutMs = 8_000
): Promise<ParsedPlayerState> {
  const deadline = Date.now() + timeoutMs;
  let lastState: ParsedPlayerState | null = null;

  while (Date.now() < deadline) {
    const state = await fetchPlayerStateFromAnyLayer(
      erConnection,
      baseConnection,
      playerState
    );
    lastState = state;
    if (predicate(state)) {
      return state;
    }
    await sleep(250);
  }

  throw new Error(
    `timed out waiting for delegated PlayerState ${playerState.toBase58()} to match expectation; last size=${
      lastState?.positionSize.toString() ?? "unknown"
    } side=${lastState?.sideFlag ?? "unknown"}`
  );
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("Trade Arena — full devnet game loop", () => {
  // ── Providers ──────────────────────────────────────────────────────────────
  //
  // provider      → Devnet base layer  (reads ANCHOR_PROVIDER_URL / ANCHOR_WALLET)
  // erConnection  → MagicBlock ER      (separate connection, same wallet)
  //
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TradeArena as Program<TradeArena>;
  const erConnection = new anchor.web3.Connection(ER_ENDPOINT, "confirmed");

  // The creator is the default wallet (pays for account creation + gas)
  const creatorWallet = provider.wallet;
  // Cast to get the raw Keypair for spl-token helpers that need a Signer
  const creatorKeypair = (creatorWallet as any).payer as anchor.web3.Keypair;

  // Two players — generated fresh each test run so devnet state is clean
  const player1 = anchor.web3.Keypair.generate();
  const player2 = anchor.web3.Keypair.generate();

  // Game parameters
  const GAME_ID = Date.now() % 1_000_000; // unique per run
  const ENTRY_FEE = 10_000_000; // 10 USDC (6 decimals)
  const DURATION = 15; // 15 seconds — enough time for the net-position ER flow

  // Virtual starting balance the program gives each player (10,000 USDC)
  const VIRTUAL_START = new BN("10000000000");

  // Mutable shared state populated by `before` and early tests
  let usdcMint: anchor.web3.PublicKey;
  let gamePDA: anchor.web3.PublicKey;
  let vaultPDA: anchor.web3.PublicKey;
  let ps1PDA: anchor.web3.PublicKey; // PlayerState for player1
  let ps2PDA: anchor.web3.PublicKey; // PlayerState for player2
  let p1UsdcATA: anchor.web3.PublicKey; // player1's USDC token account
  let p2UsdcATA: anchor.web3.PublicKey; // player2's USDC token account
  const player1SessionSigner = anchor.web3.Keypair.generate();
  let player1SessionToken: anchor.web3.PublicKey;
  let gameStartUnixTs: number | null = null;

  // ── before: fund wallets + create mock USDC ─────────────────────────────
  before("fund players and mint test USDC", async () => {
    console.log("\n  [setup] creator:", creatorWallet.publicKey.toBase58());
    console.log("  [setup] player1:", player1.publicKey.toBase58());
    console.log("  [setup] player2:", player2.publicKey.toBase58());

    // Fund players with 0.1 SOL each — enough for rent + gas (way less than 2 SOL)
    const fundTx = new anchor.web3.Transaction()
      .add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: creatorWallet.publicKey,
          toPubkey: player1.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        })
      )
      .add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: creatorWallet.publicKey,
          toPubkey: player2.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
    await provider.sendAndConfirm(fundTx);
    console.log("  [setup] funded players from creator wallet");

    // Create a fresh SPL token that acts as USDC for this test
    usdcMint = await createMint(
      provider.connection,
      creatorKeypair, // payer
      creatorKeypair.publicKey, // mint authority
      null, // no freeze authority
      6 // 6 decimals  — same as real USDC
    );
    console.log("  [setup] USDC mint:", usdcMint.toBase58());

    // Create ATA for each player
    p1UsdcATA = await createAssociatedTokenAccount(
      provider.connection,
      player1,
      usdcMint,
      player1.publicKey
    );
    p2UsdcATA = await createAssociatedTokenAccount(
      provider.connection,
      player1,
      usdcMint,
      player2.publicKey
    );

    // Mint 100 USDC to each player (they'll spend 10 as entry fee)
    await mintTo(
      provider.connection,
      creatorKeypair,
      usdcMint,
      p1UsdcATA,
      creatorKeypair,
      100_000_000
    );
    await mintTo(
      provider.connection,
      creatorKeypair,
      usdcMint,
      p2UsdcATA,
      creatorKeypair,
      100_000_000
    );

    // Pre-derive PDAs so every test can reference them
    [gamePDA] = findGamePDA(
      creatorWallet.publicKey,
      GAME_ID,
      program.programId
    );
    [vaultPDA] = findVaultPDA(gamePDA, program.programId);
    [ps1PDA] = findPlayerStatePDA(
      gamePDA,
      player1.publicKey,
      program.programId
    );
    [ps2PDA] = findPlayerStatePDA(
      gamePDA,
      player2.publicKey,
      program.programId
    );

    console.log("  [setup] game PDA:", gamePDA.toBase58());
  });

  // ── 1. create_game ─────────────────────────────────────────────────────────
  it("1. creates a game (base layer)", async () => {
    // create_game initialises the Game account and the prize vault (empty token account).
    // The vault's authority is the Game PDA — only the program can move funds out.
    //
    // Sent to: BASE LAYER (devnet)

    await program.methods
      .createGame(
        new BN(GAME_ID),
        new BN(ENTRY_FEE),
        new BN(DURATION),
        2 // max_players
      )
      .accounts({
        creator: creatorWallet.publicKey,
        game: gamePDA,
        usdcMint: usdcMint,
        vault: vaultPDA,
        assetFeed: PYTH_LAZER_BTC_USD,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const game = await program.account.game.fetch(gamePDA);
    expect(game.status).to.deep.equal({ waitingForPlayers: {} });
    expect(game.entryFee.toNumber()).to.equal(ENTRY_FEE);
    expect(game.duration.toNumber()).to.equal(DURATION);
    expect(game.playerCount).to.equal(0);
    console.log(
      "  ✓ game created, duration:",
      DURATION,
      "s, entry fee:",
      ENTRY_FEE / 1e6,
      "USDC"
    );
  });

  // ── 2. join_game × 2 ───────────────────────────────────────────────────────
  it("2. two players join and pay entry fee (base layer)", async () => {
    // join_game does two things in one tx:
    //   a) transfers real USDC (entry_fee) from the player's ATA into the prize vault
    //   b) initialises a PlayerState with 10,000 virtual USDC for paper trading
    //
    // Sent to: BASE LAYER

    for (const [player, ata, psAcc] of [
      [player1, p1UsdcATA, ps1PDA],
      [player2, p2UsdcATA, ps2PDA],
    ] as [
      anchor.web3.Keypair,
      anchor.web3.PublicKey,
      anchor.web3.PublicKey
    ][]) {
      await program.methods
        .joinGame()
        .accounts({
          player: player.publicKey,
          game: gamePDA,
          playerState: psAcc,
          playerUsdc: ata,
          vault: vaultPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    }

    const game = await program.account.game.fetch(gamePDA);
    expect(game.playerCount).to.equal(2);
    expect(game.prizePool.toNumber()).to.equal(ENTRY_FEE * 2);

    const ps1 = await program.account.playerState.fetch(ps1PDA);
    expect(ps1.virtualUsdc.eq(VIRTUAL_START)).to.be.true;
    expect(ps1.positionSize.toNumber()).to.equal(0);
    console.log(
      "  ✓ both players joined. prize pool:",
      game.prizePool.toNumber() / 1e6,
      "USDC"
    );
  });

  // ── 2.5 top up sequencer escrow ────────────────────────────────────────────
  it("2.5 fund ER escrow so the sequencer can propagate commits back to devnet", async () => {
    // The MagicBlock sequencer needs SOL to pay for the devnet transactions that
    // write ER state back to the base layer. Each delegated account authority
    // (player) must have a funded "escrow" account on the Delegation Program.
    //
    // escrowPDA = PDA(["balance", player, 255], DELEGATION_PROGRAM)
    //
    // The creator pays — players only have 0.1 SOL for their own rent+gas.
    //
    // Sent to: BASE LAYER

    for (const authority of [
      creatorWallet.publicKey,
      player1.publicKey,
      player2.publicKey,
    ]) {
      const escrowTopup = authority.equals(creatorWallet.publicKey)
        ? 0.05 * anchor.web3.LAMPORTS_PER_SOL
        : 0.02 * anchor.web3.LAMPORTS_PER_SOL;
      const escrow = escrowPdaFromEscrowAuthority(authority);
      const ix = createTopUpEscrowInstruction(
        escrow,
        authority,
        creatorWallet.publicKey, // creator funds the escrow
        escrowTopup
      );
      const tx = new anchor.web3.Transaction().add(ix);
      await provider.sendAndConfirm(tx);
      const label = authority.equals(creatorWallet.publicKey)
        ? "creator"
        : authority.equals(player1.publicKey)
        ? "player1"
        : "player2";
      console.log(
        "  ✓ escrow topped up for",
        label,
        "→",
        escrow.toBase58().slice(0, 12) + "…"
      );
    }
  });

  // ── 3. delegate_player × 2 ─────────────────────────────────────────────────
  it("3. players delegate their PlayerState to the ephemeral rollup (base layer)", async () => {
    // delegate_player moves account ownership from our program to the
    // Delegation Program.  After this call:
    //   • trade_position / end_game MUST go to the ER endpoint
    //   • Trying to fetch the PlayerState with program.account.playerState
    //     may lag while the account is delegated to the ER
    //
    // The #[delegate] macro adds extra accounts to the instruction:
    //   ownerProgram, buffer, delegationRecord, delegationMetadata,
    //   delegationProgram, systemProgram
    //
    // Sent to: BASE LAYER

    for (const [player, psAcc] of [
      [player1, ps1PDA],
      [player2, ps2PDA],
    ] as [anchor.web3.Keypair, anchor.web3.PublicKey][]) {
      const buffer = findBufferPDA(psAcc);
      const delegRecord = findDelegationRecordPDA(psAcc);
      const delegMetadata = findDelegationMetadataPDA(psAcc);

      await program.methods
        .delegatePlayer()
        .accounts({
          player: player.publicKey,
          game: gamePDA,
          playerState: psAcc,
          ownerProgram: program.programId,
          buffer: buffer,
          delegationRecord: delegRecord,
          delegationMetadata: delegMetadata,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    }

    // Account owner should now be the Delegation Program
    const info1 = await provider.connection.getAccountInfo(ps1PDA);
    expect(info1?.owner.toBase58()).to.equal(DELEGATION_PROGRAM_ID.toBase58());
    console.log("  ✓ both players delegated — accounts now on ER");
  });

  // ── 3.5 delegate_game ──────────────────────────────────────────────────────
  it("3.5 creator delegates the Game account to the ephemeral rollup (base layer)", async () => {
    await program.methods
      .delegateGame(new BN(GAME_ID))
      .accounts({
        creator: creatorWallet.publicKey,
        game: gamePDA,
        ownerProgram: program.programId,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const info = await provider.connection.getAccountInfo(gamePDA);
    expect(info?.owner.toBase58()).to.equal(DELEGATION_PROGRAM_ID.toBase58());
    console.log("  ✓ game delegated — account now on ER");
  });

  // ── 4. start_game ──────────────────────────────────────────────────────────
  it("4. creator starts the game on the Ephemeral Rollup", async () => {
    // start_game sets game.status = Active and records the start timestamp.
    // Only the creator can call this and only when ≥ 2 players have joined.
    //
    // Sent to: EPHEMERAL ROLLUP

    const tx = await program.methods
      .startGame()
      .accounts({
        creator: creatorWallet.publicKey,
        game: gamePDA,
      })
      .transaction();

    const sig = await sendToER(erConnection, creatorWallet, tx);
    await confirmERSuccess(erConnection, sig);

    const gameInfo = await erConnection.getAccountInfo(gamePDA, "confirmed");
    expect(gameInfo).to.not.be.null;
    gameStartUnixTs = parseGameStartTime(Buffer.from(gameInfo!.data));
    console.log(
      "  ✓ game started at",
      new Date(gameStartUnixTs * 1000).toISOString(),
      "— expires in",
      DURATION,
      "s. sig:",
      sig.slice(0, 16) + "…"
    );
  });

  // ── 5. trade_position × N (ER) ─────────────────────────────────────────────
  it("5. trade_position supports increase, reduce, and close-all on the Ephemeral Rollup", async () => {
    const LONG = { long: {} };
    const SHORT = { short: {} };
    const increase = (
      side: typeof LONG | typeof SHORT,
      notionalUsdc: number
    ) => ({
      increase: { side, notionalUsdc: new BN(notionalUsdc) },
    });
    const reduce = (notionalUsdc: number) => ({
      reduce: { notionalUsdc: new BN(notionalUsdc) },
    });
    const closeAll = () => ({ closeAll: {} });

    async function tradeOnER(
      signer: anchor.web3.Keypair,
      playerState: anchor.web3.PublicKey,
      action:
        | ReturnType<typeof increase>
        | ReturnType<typeof reduce>
        | ReturnType<typeof closeAll>,
      sessionToken: anchor.web3.PublicKey | null = null
    ): Promise<string> {
      const tx = await program.methods
        .tradePosition(action)
        .accounts({
          game: gamePDA,
          playerState,
          sessionToken,
          signer: signer.publicKey,
          priceFeed: PYTH_LAZER_BTC_USD,
        })
        .transaction();

      const sig = await sendPlayerToER(erConnection, signer, tx);
      await confirmERSuccess(erConnection, sig);
      return sig;
    }

    player1SessionToken = await createSessionToken({
      provider,
      authority: player1,
      sessionSigner: player1SessionSigner,
      targetProgram: program.programId,
      validUntil: Math.floor(Date.now() / 1000) + 15 * 60,
      lamports: 10_000_000,
    });
    await sleep(1_500);

    const initial = await fetchDelegatedPlayerState(erConnection, ps1PDA);
    expect(Number(initial.positionSize)).to.equal(0);

    const firstLongSig = await tradeOnER(
      player1SessionSigner,
      ps1PDA,
      increase(LONG, 1_000_000_000),
      player1SessionToken
    );
    const afterFirstLong = await waitForDelegatedPlayerState(
      erConnection,
      provider.connection,
      ps1PDA,
      (state) => Number(state.positionSize) > 0 && state.sideFlag === 0
    );
    expect(Number(afterFirstLong.positionSize)).to.be.greaterThan(0);
    expect(afterFirstLong.sideFlag).to.equal(0);
    expect(Number(afterFirstLong.entryPrice)).to.be.greaterThan(0);
    expect(Number(afterFirstLong.virtualUsdc)).to.be.lessThan(
      Number(initial.virtualUsdc)
    );

    const scaleInSig = await tradeOnER(
      player1SessionSigner,
      ps1PDA,
      increase(LONG, 600_000_000),
      player1SessionToken
    );
    const afterScaleIn = await waitForDelegatedPlayerState(
      erConnection,
      provider.connection,
      ps1PDA,
      (state) =>
        Number(state.positionSize) > Number(afterFirstLong.positionSize) &&
        state.sideFlag === 0
    );
    expect(Number(afterScaleIn.positionSize)).to.be.greaterThan(
      Number(afterFirstLong.positionSize)
    );
    expect(afterScaleIn.sideFlag).to.equal(0);
    expect(Number(afterScaleIn.entryPrice)).to.be.greaterThan(0);
    expect(Number(afterScaleIn.virtualUsdc)).to.be.lessThan(
      Number(afterFirstLong.virtualUsdc)
    );

    const reduceSig = await tradeOnER(player1, ps1PDA, reduce(500_000_000));
    const afterReduce = await waitForDelegatedPlayerState(
      erConnection,
      provider.connection,
      ps1PDA,
      (state) =>
        Number(state.positionSize) < Number(afterScaleIn.positionSize) &&
        state.sideFlag === 0
    );
    expect(Number(afterReduce.positionSize)).to.be.lessThan(
      Number(afterScaleIn.positionSize)
    );
    expect(afterReduce.sideFlag).to.equal(0);
    expect(Number(afterReduce.entryPrice)).to.equal(
      Number(afterScaleIn.entryPrice)
    );
    expect(Number(afterReduce.virtualUsdc)).to.be.greaterThan(
      Number(afterScaleIn.virtualUsdc)
    );

    const player2Sig = await tradeOnER(
      player2,
      ps2PDA,
      increase(SHORT, 700_000_000)
    );
    const player2State = await waitForDelegatedPlayerState(
      erConnection,
      provider.connection,
      ps2PDA,
      (state) => Number(state.positionSize) > 0 && state.sideFlag === 1
    );
    expect(Number(player2State.positionSize)).to.be.greaterThan(0);
    expect(player2State.sideFlag).to.equal(1);

    const closeAllSig = await tradeOnER(player1, ps1PDA, closeAll());
    const afterCloseAll = await waitForDelegatedPlayerState(
      erConnection,
      provider.connection,
      ps1PDA,
      (state) => Number(state.positionSize) === 0
    );
    expect(Number(afterCloseAll.positionSize)).to.equal(0);
    expect(Number(afterCloseAll.virtualUsdc)).to.be.greaterThan(
      Number(afterReduce.virtualUsdc)
    );

    console.log(
      "  ✓ player1 session-key trade path + direct trade path both succeeded. sigs:",
      firstLongSig.slice(0, 12) + "…",
      scaleInSig.slice(0, 12) + "…",
      reduceSig.slice(0, 12) + "…",
      closeAllSig.slice(0, 12) + "…"
    );
    console.log(
      "  ✓ player2 opened SHORT and remains open for end_game auto-settlement. sig:",
      player2Sig.slice(0, 12) + "…"
    );
  });

  // ── 6. end_game ────────────────────────────────────────────────────────────
  it("6. creator ends the game on ER and commits Game back to base", async () => {
    console.log("  ⏳ waiting for game window to expire…");
    const remainingMs = Math.max(
      0,
      ((gameStartUnixTs ?? Math.floor(Date.now() / 1000)) + DURATION) * 1_000 -
        Date.now() +
        2_500
    );
    await sleep(remainingMs);

    const endTx = await program.methods
      .endGame()
      .accounts({ game: gamePDA, priceFeed: PYTH_LAZER_BTC_USD })
      .remainingAccounts([
        { pubkey: ps1PDA, isWritable: true, isSigner: false },
        { pubkey: ps2PDA, isWritable: true, isSigner: false },
      ])
      .transaction();
    const endSig = await sendToER(erConnection, creatorWallet, endTx);
    await confirmERSuccess(erConnection, endSig);
    console.log(
      "  ✓ end_game confirmed on ER. sig:",
      endSig.slice(0, 16) + "…"
    );

    const commitTx = await program.methods
      .commitGame()
      .accounts({
        payer: creatorWallet.publicKey,
        game: gamePDA,
      })
      .remainingAccounts([
        { pubkey: ps1PDA, isWritable: true, isSigner: false },
        { pubkey: ps2PDA, isWritable: true, isSigner: false },
      ])
      .transaction();
    const commitSig = await sendToER(erConnection, creatorWallet, commitTx);
    await confirmERSuccess(erConnection, commitSig);
    console.log(
      "  ✓ commit_game confirmed on ER. sig:",
      commitSig.slice(0, 16) + "…"
    );

    const baseCommitSig = await finalizeUndelegationOnBase({
      program,
      baseConnection: provider.connection,
      erConnection,
      payer: creatorWallet.publicKey,
      programId: program.programId,
      baseAccount: gamePDA,
      accountSeeds: [
        GAME_SEED,
        creatorWallet.publicKey.toBuffer(),
        u64Le(GAME_ID),
      ],
      erScheduleSig: commitSig,
    });
    if (baseCommitSig) {
      console.log("  ✓ base-layer commit observed. sig:", baseCommitSig);
    } else {
      console.log(
        "  ✓ base-layer commit propagated; finalized via undelegation buffer"
      );
    }

    for (const [player, playerState] of [
      [player1, ps1PDA],
      [player2, ps2PDA],
    ] as [anchor.web3.Keypair, anchor.web3.PublicKey][]) {
      await finalizeUndelegationOnBase({
        program,
        baseConnection: provider.connection,
        erConnection,
        payer: creatorWallet.publicKey,
        programId: program.programId,
        baseAccount: playerState,
        accountSeeds: [
          PLAYER_SEED,
          gamePDA.toBuffer(),
          player.publicKey.toBuffer(),
        ],
        erScheduleSig: commitSig,
      });
    }

    const game = await program.account.game.fetch(gamePDA);
    expect(game.status).to.deep.equal({ ended: {} });
    expect(game.winner).to.not.be.null;
    const finalPs1 = await program.account.playerState.fetch(ps1PDA);
    const finalPs2 = await program.account.playerState.fetch(ps2PDA);
    expect(finalPs1.positionSize.toNumber()).to.equal(0);
    expect(finalPs2.positionSize.toNumber()).to.equal(0);

    const winnerStr = (game.winner as anchor.web3.PublicKey).toBase58();
    const isP1 = winnerStr === player1.publicKey.toBase58();
    console.log(
      "  ✓ game ended and committed. winner:",
      isP1 ? "player1 (LONG)" : "player2 (SHORT)"
    );
    console.log(
      "  ✓ winning portfolio:",
      game.leaderValue.toNumber() / 1e6,
      "virtual USDC"
    );
  });

  // ── 7. claim_prize ─────────────────────────────────────────────────────────
  it("7. winner claims the real USDC prize pool (base layer)", async () => {
    // claim_prize:
    //   1. Checks game.winner == signer
    //   2. Signs a token transfer CPI using the Game PDA as vault authority
    //   3. Moves all USDC from the vault into the winner's ATA
    //
    // The vault's authority is the Game PDA. The program reconstructs the
    // PDA signer seeds [GAME_SEED, creator, game_id_le8, bump] from the stored
    // game fields to authorise the transfer.
    //
    // Sent to: BASE LAYER

    const game = await program.account.game.fetch(gamePDA);
    expect(game.winner).to.not.be.null;
    const winnerKey = game.winner as anchor.web3.PublicKey;
    const isP1Win = winnerKey.equals(player1.publicKey);
    const winnerKP = isP1Win ? player1 : player2;
    const winnerATA = isP1Win ? p1UsdcATA : p2UsdcATA;

    const beforeRaw = await provider.connection.getTokenAccountBalance(
      winnerATA
    );
    const before = Number(beforeRaw.value.amount);

    await program.methods
      .claimPrize()
      .accounts({
        winner: winnerKey,
        game: gamePDA,
        vault: vaultPDA,
        winnerUsdc: winnerATA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([winnerKP])
      .rpc();

    const afterRaw = await provider.connection.getTokenAccountBalance(
      winnerATA
    );
    const after = Number(afterRaw.value.amount);

    const prizePool = ENTRY_FEE * 2; // 20 USDC in raw units
    expect(after - before).to.equal(prizePool);

    const vaultBal = await provider.connection.getTokenAccountBalance(vaultPDA);
    expect(Number(vaultBal.value.amount)).to.equal(0);

    console.log(
      "  ✓ winner received",
      prizePool / 1e6,
      "USDC — vault is now empty"
    );
    console.log("\n  🏆 full game loop complete!");
  });
});
