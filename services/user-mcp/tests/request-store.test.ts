import { expect } from "chai";
import { createRequest, getRequest } from "../src/request-store";

describe("request-store", () => {
  it("createRequest returns metadata with a uuid request_id", () => {
    const meta = createRequest({
      action: "join_arena",
      targetRuntime: "base",
      arenaId: "btc-1",
      messageHash: "abc123",
    });
    expect(meta.request_id).to.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(meta.action).to.equal("join_arena");
    expect(meta.target_runtime).to.equal("base");
    expect(meta.message_hash).to.equal("abc123");
    expect(meta.arena_id).to.equal("btc-1");
  });

  it("getRequest retrieves a stored request by id", () => {
    const meta = createRequest({
      action: "place_trade",
      targetRuntime: "er",
      arenaId: "sol-1",
      messageHash: "def456",
    });
    expect(getRequest(meta.request_id)).to.deep.equal(meta);
  });

  it("getRequest returns undefined for an unknown id", () => {
    expect(getRequest("00000000-0000-4000-8000-000000000000")).to.be.undefined;
  });

  it("each createRequest produces a unique request_id", () => {
    const a = createRequest({
      action: "close_position",
      targetRuntime: "er",
      arenaId: "btc-1",
      messageHash: "hash-a",
    });
    const b = createRequest({
      action: "close_position",
      targetRuntime: "er",
      arenaId: "btc-1",
      messageHash: "hash-b",
    });
    expect(a.request_id).to.not.equal(b.request_id);
  });
});
