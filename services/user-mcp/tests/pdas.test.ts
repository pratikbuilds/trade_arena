import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import {
  findGamePDA,
  findPlayerStatePDA,
  findVaultPDA,
  findSessionTokenPDA,
  findBufferPDA,
  findDelegationRecordPDA,
  findDelegationMetadataPDA,
  DELEGATION_PROGRAM_ID,
  SESSION_KEYS_PROGRAM_ID,
  u64Le,
} from "../src/pdas";

// Stable fixture pubkeys for deterministic PDA derivation tests
const PROGRAM_ID = new PublicKey(
  "FkGTyZiUCFqPi7hPjBxDBRJVREhV8SYbbBLBxMqZLnYM"
);
const CREATOR = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const PLAYER = new PublicKey("6sbzC1eH4FTujJXWj51eQe25cYvr4xfXbJ1Dqx1XQNB5");

describe("u64Le", () => {
  it("encodes zero as 8 zero bytes", () => {
    expect(u64Le(0)).to.deep.equal(Buffer.alloc(8, 0));
  });

  it("encodes 1 as little-endian", () => {
    const buf = u64Le(1);
    expect(buf[0]).to.equal(1);
    expect(buf.slice(1)).to.deep.equal(Buffer.alloc(7, 0));
  });

  it("is stable across calls with the same input", () => {
    expect(u64Le(42)).to.deep.equal(u64Le(42));
  });
});

describe("findGamePDA", () => {
  it("returns a valid PublicKey", () => {
    const pda = findGamePDA(CREATOR, 1, PROGRAM_ID);
    expect(pda).to.be.instanceOf(PublicKey);
    expect(pda.toBase58()).to.have.length.greaterThan(30);
  });

  it("is deterministic", () => {
    const a = findGamePDA(CREATOR, 1, PROGRAM_ID);
    const b = findGamePDA(CREATOR, 1, PROGRAM_ID);
    expect(a.toBase58()).to.equal(b.toBase58());
  });

  it("differs across game IDs", () => {
    const a = findGamePDA(CREATOR, 1, PROGRAM_ID);
    const b = findGamePDA(CREATOR, 2, PROGRAM_ID);
    expect(a.toBase58()).to.not.equal(b.toBase58());
  });
});

describe("findPlayerStatePDA", () => {
  it("returns a valid deterministic PublicKey", () => {
    const game = findGamePDA(CREATOR, 1, PROGRAM_ID);
    const a = findPlayerStatePDA(game, PLAYER, PROGRAM_ID);
    const b = findPlayerStatePDA(game, PLAYER, PROGRAM_ID);
    expect(a.toBase58()).to.equal(b.toBase58());
  });

  it("differs across players", () => {
    const game = findGamePDA(CREATOR, 1, PROGRAM_ID);
    const other = new PublicKey("3ZgmNR3pb8JCGbwJNhMzMd5xXiNVxLaGN47yh1WQNL3h");
    const a = findPlayerStatePDA(game, PLAYER, PROGRAM_ID);
    const b = findPlayerStatePDA(game, other, PROGRAM_ID);
    expect(a.toBase58()).to.not.equal(b.toBase58());
  });
});

describe("findVaultPDA", () => {
  it("returns a valid deterministic PublicKey", () => {
    const game = findGamePDA(CREATOR, 1, PROGRAM_ID);
    const a = findVaultPDA(game, PROGRAM_ID);
    const b = findVaultPDA(game, PROGRAM_ID);
    expect(a.toBase58()).to.equal(b.toBase58());
  });
});

describe("findSessionTokenPDA", () => {
  it("returns a valid deterministic PublicKey", () => {
    const session = new PublicKey(
      "6sbzC1eH4FTujJXWj51eQe25cYvr4xfXbJ1Dqx1XQNB5"
    );
    const a = findSessionTokenPDA(PROGRAM_ID, session, PLAYER);
    const b = findSessionTokenPDA(PROGRAM_ID, session, PLAYER);
    expect(a.toBase58()).to.equal(b.toBase58());
    // Must be derived from SESSION_KEYS_PROGRAM_ID, not PROGRAM_ID
    const viaProgram = PublicKey.findProgramAddressSync(
      [
        Buffer.from("session_token"),
        PROGRAM_ID.toBuffer(),
        session.toBuffer(),
        PLAYER.toBuffer(),
      ],
      SESSION_KEYS_PROGRAM_ID
    )[0];
    expect(a.toBase58()).to.equal(viaProgram.toBase58());
  });
});

describe("MagicBlock delegation PDAs", () => {
  it("findBufferPDA is deterministic and uses DELEGATION_PROGRAM_ID", () => {
    const account = findGamePDA(CREATOR, 1, PROGRAM_ID);
    const a = findBufferPDA(account);
    const b = findBufferPDA(account);
    expect(a.toBase58()).to.equal(b.toBase58());
    const expected = PublicKey.findProgramAddressSync(
      [Buffer.from("buffer"), account.toBuffer()],
      DELEGATION_PROGRAM_ID
    )[0];
    expect(a.toBase58()).to.equal(expected.toBase58());
  });

  it("findDelegationRecordPDA is deterministic", () => {
    const account = findGamePDA(CREATOR, 1, PROGRAM_ID);
    expect(findDelegationRecordPDA(account).toBase58()).to.equal(
      findDelegationRecordPDA(account).toBase58()
    );
  });

  it("findDelegationMetadataPDA is deterministic", () => {
    const account = findGamePDA(CREATOR, 1, PROGRAM_ID);
    expect(findDelegationMetadataPDA(account).toBase58()).to.equal(
      findDelegationMetadataPDA(account).toBase58()
    );
  });

  it("buffer / record / metadata PDAs are all distinct", () => {
    const account = findGamePDA(CREATOR, 1, PROGRAM_ID);
    const buf = findBufferPDA(account).toBase58();
    const rec = findDelegationRecordPDA(account).toBase58();
    const meta = findDelegationMetadataPDA(account).toBase58();
    expect(buf).to.not.equal(rec);
    expect(rec).to.not.equal(meta);
    expect(buf).to.not.equal(meta);
  });
});
