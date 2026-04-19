// ═══════════════════════════════════════════════════════════════════════════
// Trade Arena — Real 5-Minute Multi-Trade Simulation
// ═══════════════════════════════════════════════════════════════════════════
//
// This harness runs a real devnet + MagicBlock ER game and replaces the
// previous hand-authored timeline with a live trading loop:
//   • same base-layer deposit / ER game / base-layer withdrawal flow
//   • same live Pyth Lazer BTC/USD oracle on the ER
//   • >10 completed trades per player
//   • per-trade ledger: side, size, entry, exit, hold time, pnl
//
// HOW TO RUN
// ──────────
//   1. anchor build -- --features testing
//   2. anchor deploy --provider.cluster devnet
//   3. ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//      ANCHOR_WALLET=~/.config/solana/id.json \
//      yarn ts-mocha -p ./tsconfig.json -t 1200000 tests/simulate_real_game.ts
//
// ═══════════════════════════════════════════════════════════════════════════

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { TradeArena } from "../target/types/trade_arena";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  createTopUpEscrowInstruction,
  escrowPdaFromEscrowAuthority,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { expect } from "chai";

const PYTH_LAZER_BTC_USD = new anchor.web3.PublicKey(
  "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr"
);
const DELEGATION_PROGRAM_ID = new anchor.web3.PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
const ER_ENDPOINT = "https://devnet.magicblock.app/";

const GAME_SEED = Buffer.from("game");
const PLAYER_SEED = Buffer.from("player");
const VAULT_SEED = Buffer.from("vault");

const DURATION = 300;
const ENTRY_FEE = 1_000_000;
const TARGET_TRADES_PER_PLAYER = 12;
const HOLD_MS = 6_000;
const PAUSE_BETWEEN_CYCLES_MS = 1_500;
const ENTRY_BUFFER_MS = 45_000;
const MIN_TRADE_NOTIONAL_USD = 150;
const MAX_TRADE_NOTIONAL_USD = 900;

type SideArg = { long: {} } | { short: {} };

type ParsedPlayerState = {
  virtualUsdc: bigint;
  positionSize: bigint;
  sideFlag: number;
  entryPrice: bigint;
  realizedPnl: bigint;
};

type TradeRecord = {
  player: string;
  cycle: number;
  side: "LONG" | "SHORT";
  sizeBtc: number;
  entryUsd: number;
  exitUsd?: number;
  collateralUsd: number;
  pnlUsd?: number;
  openedAtMs: number;
  closedAtMs?: number;
  openSig: string;
  closeSig?: string;
};

function u64Le(n: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n));
  return buf;
}

function findGamePDA(
  creator: anchor.web3.PublicKey,
  gameId: number,
  programId: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [GAME_SEED, creator.toBuffer(), u64Le(gameId)],
    programId
  );
}

function findPlayerStatePDA(
  game: anchor.web3.PublicKey,
  player: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [PLAYER_SEED, game.toBuffer(), player.toBuffer()],
    programId
  );
}

function findVaultPDA(
  game: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [VAULT_SEED, game.toBuffer()],
    programId
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function elapsed(startMs: number): string {
  return `T+${Math.round((Date.now() - startMs) / 1000)}s`;
}

function fmtUsd(v: number): string {
  return v.toFixed(2);
}

function fmtBtc(v: number): string {
  return v.toFixed(4);
}

async function sendToER(
  erConn: anchor.web3.Connection,
  signer: anchor.web3.Keypair,
  tx: anchor.web3.Transaction
): Promise<string> {
  tx.feePayer = signer.publicKey;
  const { blockhash } = await erConn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(signer);
  return erConn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
}

async function confirmER(
  erConn: anchor.web3.Connection,
  sig: string
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await erConn.confirmTransaction(sig, "confirmed");
      return;
    } catch {
      if (attempt === 2) {
        throw new Error(`ER confirm timeout for ${sig.slice(0, 12)}`);
      }
      await sleep(1_000);
    }
  }
}

function parsePlayerStateBuffer(data: Buffer): ParsedPlayerState | null {
  if (data.length < 106) return null;
  let off = 8 + 32 + 32;
  const virtualUsdc = data.readBigUInt64LE(off);
  off += 8;
  const positionSize = data.readBigUInt64LE(off);
  off += 8;
  const sideFlag = data[off];
  off += 1;
  const entryPrice = data.readBigUInt64LE(off);
  off += 8;
  const realizedPnl = data.readBigInt64LE(off);

  if (virtualUsdc === 0n) return null;

  return { virtualUsdc, positionSize, sideFlag, entryPrice, realizedPnl };
}

async function fetchPlayerState(
  ps: anchor.web3.PublicKey,
  erConnection: anchor.web3.Connection,
  baseConnection: anchor.web3.Connection
): Promise<ParsedPlayerState | null> {
  for (const conn of [erConnection, baseConnection]) {
    const acct = await conn.getAccountInfo(ps);
    if (!acct) continue;
    const parsed = parsePlayerStateBuffer(Buffer.from(acct.data));
    if (parsed) return parsed;
  }
  return null;
}

async function fetchLivePriceUsd(
  conn: anchor.web3.Connection,
  priceFeed: anchor.web3.PublicKey
): Promise<number> {
  const acct = await conn.getAccountInfo(priceFeed, "confirmed");
  if (!acct || acct.data.length < 134) {
    throw new Error("invalid live price feed account");
  }

  const data = Buffer.from(acct.data);
  const rawPrice = Number(data.readBigInt64LE(73));
  const expoMagnitude = data.readInt32LE(89);
  const price = rawPrice / 10 ** expoMagnitude;

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`invalid decoded price: ${price}`);
  }

  return price;
}

function sideToString(side: SideArg): "LONG" | "SHORT" {
  return "long" in side ? "LONG" : "SHORT";
}

function decideSide(
  player: string,
  priceHistory: number[],
  cycle: number
): SideArg {
  if (priceHistory.length < 3) {
    if (player === "beta") return { short: {} };
    return { long: {} };
  }

  const p0 = priceHistory[priceHistory.length - 3];
  const p1 = priceHistory[priceHistory.length - 2];
  const p2 = priceHistory[priceHistory.length - 1];
  const momentum = p2 - p1;
  const acceleration = p2 - p1 - (p1 - p0);
  const mean = (p0 + p1 + p2) / 3;

  if (player === "alpha") {
    return momentum >= 0 ? { long: {} } : { short: {} };
  }

  if (player === "beta") {
    return momentum >= 0 ? { short: {} } : { long: {} };
  }

  if (Math.abs(acceleration) > 2) {
    return acceleration >= 0 ? { long: {} } : { short: {} };
  }

  if (Math.abs(p2 - mean) > 4) {
    return p2 >= mean ? { short: {} } : { long: {} };
  }

  return cycle % 2 === 0 ? { long: {} } : { short: {} };
}

function computeTradeSizeUnits(
  virtualUsdc: bigint,
  livePriceUsd: number,
  cycle: number
): number {
  const virtualUsd = Number(virtualUsdc) / 1e6;
  const notionalUsd = Math.max(
    MIN_TRADE_NOTIONAL_USD,
    Math.min(MAX_TRADE_NOTIONAL_USD, virtualUsd * (0.055 + (cycle % 3) * 0.015))
  );
  const btc = notionalUsd / livePriceUsd;
  const units = Math.floor(btc * 1e6);
  return Math.max(units, 1_500);
}

describe("Trade Arena — Real 5-Minute Multi-Trade Simulation", function () {
  this.timeout(1_200_000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.TradeArena as Program<TradeArena>;
  const erConnection = new anchor.web3.Connection(ER_ENDPOINT, "confirmed");

  const creatorWallet = provider.wallet;
  const creatorKeypair = (creatorWallet as any).payer as anchor.web3.Keypair;

  const alpha = anchor.web3.Keypair.generate();
  const beta = anchor.web3.Keypair.generate();
  const gamma = anchor.web3.Keypair.generate();
  const players = [alpha, beta, gamma] as const;

  const GAME_ID = Date.now() % 1_000_000;

  const playerNames: Record<string, string> = {};
  const completedTrades: Record<string, number> = {
    alpha: 0,
    beta: 0,
    gamma: 0,
  };
  const tradeLedger: TradeRecord[] = [];
  const openTradeByPlayer = new Map<string, TradeRecord>();
  const priceHistory: number[] = [];

  let usdcMint: anchor.web3.PublicKey;
  let gamePDA: anchor.web3.PublicKey;
  let vaultPDA: anchor.web3.PublicKey;
  let psAlpha: anchor.web3.PublicKey;
  let psBeta: anchor.web3.PublicKey;
  let psGamma: anchor.web3.PublicKey;
  let alphaATA: anchor.web3.PublicKey;
  let betaATA: anchor.web3.PublicKey;
  let gammaATA: anchor.web3.PublicKey;
  let gameStartMs = Date.now();

  before("fund players and create USDC", async function () {
    playerNames[alpha.publicKey.toBase58()] = "alpha";
    playerNames[beta.publicKey.toBase58()] = "beta";
    playerNames[gamma.publicKey.toBase58()] = "gamma";

    console.log("\n  Players:");
    console.log("    alpha:", alpha.publicKey.toBase58());
    console.log("    beta: ", beta.publicKey.toBase58());
    console.log("    gamma:", gamma.publicKey.toBase58());

    const fundTx = new anchor.web3.Transaction();
    for (const p of players) {
      fundTx.add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: creatorWallet.publicKey,
          toPubkey: p.publicKey,
          lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
        })
      );
    }
    await provider.sendAndConfirm(fundTx);
    console.log("  ✓ funded players (0.1 SOL each)");

    usdcMint = await createMint(
      provider.connection,
      creatorKeypair,
      creatorKeypair.publicKey,
      null,
      6
    );
    console.log("  ✓ USDC mint:", usdcMint.toBase58());

    alphaATA = await createAssociatedTokenAccount(
      provider.connection,
      alpha,
      usdcMint,
      alpha.publicKey
    );
    betaATA = await createAssociatedTokenAccount(
      provider.connection,
      beta,
      usdcMint,
      beta.publicKey
    );
    gammaATA = await createAssociatedTokenAccount(
      provider.connection,
      gamma,
      usdcMint,
      gamma.publicKey
    );

    for (const [kp, ata] of [
      [alpha, alphaATA],
      [beta, betaATA],
      [gamma, gammaATA],
    ] as [anchor.web3.Keypair, anchor.web3.PublicKey][]) {
      await mintTo(
        provider.connection,
        creatorKeypair,
        usdcMint,
        ata,
        creatorKeypair,
        100_000_000
      );
    }
    console.log("  ✓ minted 100 USDC to each player");

    [gamePDA] = findGamePDA(
      creatorWallet.publicKey,
      GAME_ID,
      program.programId
    );
    [vaultPDA] = findVaultPDA(gamePDA, program.programId);
    [psAlpha] = findPlayerStatePDA(gamePDA, alpha.publicKey, program.programId);
    [psBeta] = findPlayerStatePDA(gamePDA, beta.publicKey, program.programId);
    [psGamma] = findPlayerStatePDA(gamePDA, gamma.publicKey, program.programId);
  });

  it("A. [Base] create game, join × 3, fund escrows, delegate all accounts", async function () {
    const t0 = Date.now();
    const log = (msg: string) => console.log(`  [${elapsed(t0)}] ${msg}`);

    await program.methods
      .createGame(new BN(GAME_ID), new BN(ENTRY_FEE), new BN(DURATION), 3)
      .accounts({
        creator: creatorWallet.publicKey,
        game: gamePDA,
        usdcMint,
        vault: vaultPDA,
        assetFeed: PYTH_LAZER_BTC_USD,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();
    log("✓ game created");

    for (const [player, ata, ps] of [
      [alpha, alphaATA, psAlpha],
      [beta, betaATA, psBeta],
      [gamma, gammaATA, psGamma],
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
          playerState: ps,
          playerUsdc: ata,
          vault: vaultPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    }
    const game = await program.account.game.fetch(gamePDA);
    log(`✓ all 3 joined — prize pool: ${game.prizePool.toNumber() / 1e6} USDC`);

    const escrowTopup = 0.01 * anchor.web3.LAMPORTS_PER_SOL;
    for (const authority of [
      creatorWallet.publicKey,
      ...players.map((p) => p.publicKey),
    ]) {
      const escrow = escrowPdaFromEscrowAuthority(authority);
      const ix = createTopUpEscrowInstruction(
        escrow,
        authority,
        creatorWallet.publicKey,
        escrowTopup
      );
      await provider.sendAndConfirm(new anchor.web3.Transaction().add(ix));
    }
    log("✓ ER escrows funded");

    for (const [player, ps] of [
      [alpha, psAlpha],
      [beta, psBeta],
      [gamma, psGamma],
    ] as [anchor.web3.Keypair, anchor.web3.PublicKey][]) {
      await program.methods
        .delegatePlayer()
        .accounts({
          player: player.publicKey,
          game: gamePDA,
          playerState: ps,
          ownerProgram: program.programId,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    }
    log("✓ all PlayerState accounts delegated to ER");

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
    log("✓ Game account delegated to ER");
  });

  it("B. [ER] start game and run 12 live round trips per player", async function () {
    const log = (msg: string) =>
      console.log(`  [${elapsed(gameStartMs)}] ${msg}`);

    async function openPos(
      player: anchor.web3.Keypair,
      ps: anchor.web3.PublicKey,
      cycle: number
    ): Promise<void> {
      const name = playerNames[player.publicKey.toBase58()];
      const before = await fetchPlayerState(
        ps,
        erConnection,
        provider.connection
      );
      expect(before, `missing state before opening for ${name}`).to.not.equal(
        null
      );
      expect(Number(before!.positionSize)).to.equal(0);

      const livePriceUsd = await fetchLivePriceUsd(
        erConnection,
        PYTH_LAZER_BTC_USD
      );
      priceHistory.push(livePriceUsd);
      const side = decideSide(name, priceHistory, cycle);
      const sizeUnits = computeTradeSizeUnits(
        before!.virtualUsdc,
        livePriceUsd,
        cycle
      );

      const tx = await program.methods
        .openPosition(new BN(sizeUnits), side)
        .accounts({
          player: player.publicKey,
          game: gamePDA,
          playerState: ps,
          priceFeed: PYTH_LAZER_BTC_USD,
        })
        .transaction();

      const sig = await sendToER(erConnection, player, tx);
      await confirmER(erConnection, sig);
      await sleep(600);

      const after = await fetchPlayerState(
        ps,
        erConnection,
        provider.connection
      );
      expect(after, `missing state after opening for ${name}`).to.not.equal(
        null
      );
      expect(Number(after!.positionSize)).to.be.greaterThan(0);

      const entryUsd = Number(after!.entryPrice) / 1e6;
      const collateralUsd =
        (Number(before!.virtualUsdc) - Number(after!.virtualUsdc)) / 1e6;
      const record: TradeRecord = {
        player: name,
        cycle,
        side: sideToString(side),
        sizeBtc: Number(after!.positionSize) / 1e6,
        entryUsd,
        collateralUsd,
        openedAtMs: Date.now(),
        openSig: sig,
      };

      openTradeByPlayer.set(player.publicKey.toBase58(), record);
      tradeLedger.push(record);

      log(
        `✓ ${name} opened ${record.side.padEnd(5)} ${fmtBtc(
          record.sizeBtc
        )} BTC @ $${fmtUsd(record.entryUsd)} collateral=$${fmtUsd(
          record.collateralUsd
        )} sig:${sig.slice(0, 8)}…`
      );
    }

    async function closePos(
      player: anchor.web3.Keypair,
      ps: anchor.web3.PublicKey
    ): Promise<void> {
      const name = playerNames[player.publicKey.toBase58()];
      const record = openTradeByPlayer.get(player.publicKey.toBase58());
      expect(record, `no open trade record for ${name}`).to.not.equal(
        undefined
      );

      const before = await fetchPlayerState(
        ps,
        erConnection,
        provider.connection
      );
      expect(before, `missing state before close for ${name}`).to.not.equal(
        null
      );

      const tx = await program.methods
        .closePosition()
        .accounts({
          player: player.publicKey,
          game: gamePDA,
          playerState: ps,
          priceFeed: PYTH_LAZER_BTC_USD,
        })
        .transaction();

      const sig = await sendToER(erConnection, player, tx);
      await confirmER(erConnection, sig);
      await sleep(600);

      const after = await fetchPlayerState(
        ps,
        erConnection,
        provider.connection
      );
      expect(after, `missing state after close for ${name}`).to.not.equal(null);
      expect(Number(after!.positionSize)).to.equal(0);

      record!.exitUsd = Number(
        await fetchLivePriceUsd(erConnection, PYTH_LAZER_BTC_USD)
      );
      record!.pnlUsd =
        (Number(after!.realizedPnl) - Number(before!.realizedPnl)) / 1e6;
      record!.closedAtMs = Date.now();
      record!.closeSig = sig;

      completedTrades[name] += 1;
      openTradeByPlayer.delete(player.publicKey.toBase58());

      log(
        `✓ ${name} closed ${record!.side.padEnd(5)} exit≈$${fmtUsd(
          record!.exitUsd
        )} pnl=$${fmtUsd(record!.pnlUsd!)} hold=${(
          (record!.closedAtMs - record!.openedAtMs) /
          1000
        ).toFixed(1)}s sig:${sig.slice(0, 8)}…`
      );
    }

    const startTx = await program.methods
      .startGame()
      .accounts({
        creator: creatorWallet.publicKey,
        game: gamePDA,
      })
      .transaction();
    const startSig = await sendToER(erConnection, creatorKeypair, startTx);
    await confirmER(erConnection, startSig);
    gameStartMs = Date.now();

    console.log(`\n  [${elapsed(gameStartMs)}] ✓ game started on ER`);
    console.log(
      `  Strategy set: alpha=momentum | beta=mean-reversion | gamma=hybrid`
    );
    console.log(
      `  Target: ${TARGET_TRADES_PER_PLAYER} closed trades per player`
    );

    for (let i = 0; i < 3; i++) {
      priceHistory.push(
        await fetchLivePriceUsd(erConnection, PYTH_LAZER_BTC_USD)
      );
      await sleep(800);
    }

    let cycle = 0;
    while (
      Math.min(...Object.values(completedTrades)) < TARGET_TRADES_PER_PLAYER &&
      Date.now() < gameStartMs + DURATION * 1000 - ENTRY_BUFFER_MS
    ) {
      cycle += 1;
      log(
        `cycle ${cycle} — live BTC: $${fmtUsd(
          priceHistory[priceHistory.length - 1]
        )} | completed alpha=${completedTrades.alpha} beta=${
          completedTrades.beta
        } gamma=${completedTrades.gamma}`
      );

      await openPos(alpha, psAlpha, cycle);
      await openPos(beta, psBeta, cycle);
      await openPos(gamma, psGamma, cycle);

      log(`↻ holding positions for ${(HOLD_MS / 1000).toFixed(1)}s`);
      await sleep(HOLD_MS);

      await closePos(alpha, psAlpha);
      await closePos(beta, psBeta);
      await closePos(gamma, psGamma);

      priceHistory.push(
        await fetchLivePriceUsd(erConnection, PYTH_LAZER_BTC_USD)
      );
      await sleep(PAUSE_BETWEEN_CYCLES_MS);
    }

    expect(completedTrades.alpha).to.be.greaterThan(
      TARGET_TRADES_PER_PLAYER - 1
    );
    expect(completedTrades.beta).to.be.greaterThan(
      TARGET_TRADES_PER_PLAYER - 1
    );
    expect(completedTrades.gamma).to.be.greaterThan(
      TARGET_TRADES_PER_PLAYER - 1
    );
    expect(openTradeByPlayer.size).to.equal(0);

    const msUntilExpiry = gameStartMs + DURATION * 1000 - Date.now();
    if (msUntilExpiry > 0) {
      log(
        `↻ all targets hit — waiting ${(msUntilExpiry / 1000).toFixed(
          1
        )}s for expiry`
      );
      await sleep(msUntilExpiry + 2_000);
    }
    log("✓ game window expired");
  });

  it("C. [ER] end_game crowns winner, commit_game pushes result to base layer", async function () {
    const log = (msg: string) =>
      console.log(`  [${elapsed(gameStartMs)}] ${msg}`);

    log("sending end_game to ER…");
    const endTx = await program.methods
      .endGame()
      .accounts({ game: gamePDA })
      .remainingAccounts([
        { pubkey: psAlpha, isWritable: false, isSigner: false },
        { pubkey: psBeta, isWritable: false, isSigner: false },
        { pubkey: psGamma, isWritable: false, isSigner: false },
      ])
      .transaction();
    const endSig = await sendToER(erConnection, creatorKeypair, endTx);
    await confirmER(erConnection, endSig);
    log(`✓ end_game confirmed on ER sig:${endSig.slice(0, 8)}…`);

    log("sending commit_game to ER…");
    const commitTx = await program.methods
      .commitGame()
      .accounts({ payer: creatorWallet.publicKey, game: gamePDA })
      .transaction();
    const commitSig = await sendToER(erConnection, creatorKeypair, commitTx);
    await confirmER(erConnection, commitSig);
    log(`✓ commit_game confirmed on ER sig:${commitSig.slice(0, 8)}…`);

    log("⏳ polling for game propagation to base layer…");
    const programStr = program.programId.toBase58();
    const deadline = Date.now() + 120_000;
    let propagated = false;
    while (Date.now() < deadline) {
      await sleep(5_000);
      const info = await provider.connection.getAccountInfo(gamePDA);
      const owner = info?.owner.toBase58();
      log(`  game owner on base: ${owner?.slice(0, 12)}…`);
      if (owner === programStr) {
        propagated = true;
        break;
      }
    }
    expect(propagated, "game did not propagate to base within 120 s").to.be
      .true;
    log("✓ game account back on base layer with winner recorded");
  });

  it("D. [Base] display final leaderboard and full trade ledger", async function () {
    const log = (msg: string) =>
      console.log(`  [${elapsed(gameStartMs)}] ${msg}`);

    const game = await program.account.game.fetch(gamePDA);
    expect(game.status).to.deep.equal({ ended: {} });
    expect(game.winner).to.not.be.null;

    const winnerKey = (game.winner as anchor.web3.PublicKey).toBase58();
    const winnerName = playerNames[winnerKey] ?? `${winnerKey.slice(0, 8)}…`;

    log(
      "\n  ┌─────── Final Leaderboard ──────────────────────────────────────────────────┐"
    );
    for (const [player, ps, name] of [
      [alpha, psAlpha, "alpha"],
      [beta, psBeta, "beta"],
      [gamma, psGamma, "gamma"],
    ] as [anchor.web3.Keypair, anchor.web3.PublicKey, string][]) {
      const state = await fetchPlayerState(
        ps,
        erConnection,
        provider.connection
      );
      expect(state, `${name} state missing at final leaderboard`).to.not.equal(
        null
      );

      const playerTrades = tradeLedger.filter((t) => t.player === name);
      const totalPnl = playerTrades.reduce(
        (sum, t) => sum + (t.pnlUsd ?? 0),
        0
      );
      const wins = playerTrades.filter((t) => (t.pnlUsd ?? 0) > 0).length;
      const isWinner = player.publicKey.toBase58() === winnerKey;
      const nameLabel = (name + (isWinner ? " 🏆" : "")).padEnd(12);
      const posStr =
        Number(state!.positionSize) > 0
          ? `OPEN ${["Long", "Short"][state!.sideFlag] || "?"}`
          : "Flat";

      log(
        `  │  ${nameLabel} cash=$${fmtUsd(
          Number(state!.virtualUsdc) / 1e6
        )} trades=${playerTrades.length} wins=${wins} totalPnl=$${fmtUsd(
          totalPnl
        )} pos=[${posStr}]`
      );
    }
    log("  │");
    log(
      `  │  Winner: ${winnerName}  Score: ${(
        game.leaderValue.toNumber() / 1e6
      ).toFixed(4)} virtual USDC`
    );
    log(`  │  Prize pool: ${(ENTRY_FEE * 3) / 1e6} USDC`);
    log(
      "  └────────────────────────────────────────────────────────────────────────────┘"
    );

    log(
      "\n  ┌─────── Trade Ledger ────────────────────────────────────────────────────────┐"
    );
    for (const trade of tradeLedger) {
      log(
        `  │  ${trade.player.padEnd(5)} #${String(trade.cycle).padStart(
          2,
          "0"
        )} ${trade.side.padEnd(5)} size=${fmtBtc(
          trade.sizeBtc
        )} BTC entry=$${fmtUsd(trade.entryUsd)} exit=$${fmtUsd(
          trade.exitUsd ?? 0
        )} pnl=$${fmtUsd(trade.pnlUsd ?? 0)} hold=${(
          ((trade.closedAtMs ?? trade.openedAtMs) - trade.openedAtMs) /
          1000
        ).toFixed(1)}s`
      );
    }
    log(
      "  └────────────────────────────────────────────────────────────────────────────┘"
    );
  });

  it("E. [Base] winner claims real USDC from the prize vault", async function () {
    const log = (msg: string) =>
      console.log(`  [${elapsed(gameStartMs)}] ${msg}`);

    const game = await program.account.game.fetch(gamePDA);
    const winnerKey = game.winner as anchor.web3.PublicKey;
    const winnerName = playerNames[winnerKey.toBase58()] ?? "unknown";
    const winnerKP = [alpha, beta, gamma].find((p) =>
      p.publicKey.equals(winnerKey)
    )!;
    const winnerATA = [alphaATA, betaATA, gammaATA][
      [alpha, beta, gamma].indexOf(winnerKP)
    ];

    const beforeBal = (await getAccount(provider.connection, winnerATA)).amount;

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

    const afterBal = (await getAccount(provider.connection, winnerATA)).amount;
    const prize = Number(afterBal - beforeBal) / 1e6;
    expect(prize).to.equal((ENTRY_FEE * 3) / 1e6);

    const vaultBal = (await getAccount(provider.connection, vaultPDA)).amount;
    expect(Number(vaultBal)).to.equal(0);

    log(`\n  🏆 ${winnerName} wins ${prize} USDC — vault drained to 0`);
    log(
      `      Completed trades: alpha=${completedTrades.alpha} beta=${completedTrades.beta} gamma=${completedTrades.gamma}`
    );
    log(
      `      Total elapsed: ${Math.round((Date.now() - gameStartMs) / 1000)} s`
    );
  });
});
