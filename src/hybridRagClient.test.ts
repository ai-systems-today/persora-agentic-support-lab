import { describe, expect, it } from "vitest";
import { normalizeHybridResult } from "./hybridRagClient";

describe("normalizeHybridResult", () => {
  it("accepts the exact-run evidence contract", () => {
    const result = normalizeHybridResult({
      runId: "run-1", question: "travel", vectorMatches: [], graphFacts: [],
      evidence: [{ backend: "pinecone", executed: true, durationMs: 12, records: 0, error: null }],
      totalMs: 12, error: null,
    });
    expect(result.runId).toBe("run-1");
    expect(result.evidence[0].executed).toBe(true);
  });

  it("fails closed for malformed responses", () => {
    expect(() => normalizeHybridResult({ runId: "run-1" })).toThrow("invalid evidence contract");
  });
});
