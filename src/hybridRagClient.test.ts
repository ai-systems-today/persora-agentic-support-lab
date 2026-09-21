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

  it("preserves exact-run evidence when a backend failure is returned", () => {
    const result = normalizeHybridResult({
      runId: "run-2", question: "travel", vectorMatches: [], graphFacts: [],
      evidence: [{ backend: "azure-openai", executed: false, durationMs: 7, records: 0, error: "Provider returned HTTP 502" }],
      totalMs: 7, error: "Query embedding failed; retrieval was not executed.",
    });
    expect(result.error).toContain("retrieval was not executed");
    expect(result.evidence[0].executed).toBe(false);
  });
});
