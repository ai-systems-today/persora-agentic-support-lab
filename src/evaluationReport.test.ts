import { describe, expect, it } from "vitest";
import { decideAnswer, labelledRetrieval, latencySummary, metric, comparisonWarnings, type BenchmarkReport } from "../supabase/functions/_shared/evaluationReport";
describe("shared evaluation evidence", () => {
  it("rejects invalid scores without clamping them into a pass", () => {
    expect(metric("bad", 2, "ratio", "test", "").status).toBe("error");
    expect(metric("missing", null, "ratio", "test", "No reference")).toMatchObject({ value: null, status: "not-evaluated" });
  });
  it("counts unique relevant documents and distinguishes ranking quality", () => {
    const labels = { a: 3, b: 1, c: 0 };
    const ranked = labelledRetrieval(["a", "a", "c"], labels, 2);
    expect(ranked[0].value).toBe(.5);
    expect(ranked[1].value).toBe(.5);
    expect(labelledRetrieval(["a", "b"], labels, 2)[2].value).toBe(1);
    expect(labelledRetrieval(["b", "a"], labels, 2)[2].value).toBeLessThan(1);
    expect(labelledRetrieval(["a"], undefined, 10).every(m => m.value === null)).toBe(true);
  });
  it("does not publish p95 from six smoke measurements", () => {
    expect(latencySummary([1, 2, 3, 4, 5, 6])).toMatchObject({ count: 6, median: 3.5, p95: null });
    expect(latencySummary(Array.from({ length: 20 }, (_, i) => i + 1)).p95).toBe(19);
  });
  it("distinguishes unknown evaluation, semantic failure and policy routes", () => {
    expect(decideAnswer({ knowledgeAnswer: true, judgeStatus: "not-evaluated", invalidCitations: false, unsupportedCount: 0 }).action).toBe("qualify");
    expect(decideAnswer({ knowledgeAnswer: true, judgeStatus: "failed", invalidCitations: false, unsupportedCount: 1 }).action).toBe("fallback");
    expect(decideAnswer({ knowledgeAnswer: false, judgeStatus: "not-evaluated", invalidCitations: false, unsupportedCount: 0 }).action).toBe("policy-response");
  });
  it("flags corpus drift when comparing runs", () => {
    const a = { datasetVersion: "a", sourceVersion: "1", evaluatorVersion: "1", scope: "fresh-application" } as BenchmarkReport;
    expect(comparisonWarnings(a, { ...a, sourceVersion: "2" })).toEqual(["sourceVersion differs; comparison is not controlled"]);
  });
});

it("withholds explicitly failed answers even when the judge lists no unsupported claim", () => {
  expect(decideAnswer({ knowledgeAnswer: true, judgeStatus: "failed", invalidCitations: false, unsupportedCount: 0, generatorEvidenceCaptured: true }).action).toBe("fallback");
});
