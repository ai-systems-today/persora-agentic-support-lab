import { describe, expect, it } from "vitest";
import { exportNumericScores, exportNumericScoreBatch } from "../supabase/functions/_shared/langfuseScores";
describe("private Langfuse score export", () => {
  it("exports valid available values with stable IDs and excludes private reason text", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const result = await exportNumericScores({ baseUrl: "https://example.test", publicKey: "test-public", secretKey: "test-secret", traceId: "trace",
      scores: [{ name: "faithfulness", value: .5, reason: "private email" }, { name: "missing", value: null }],
      fetcher: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response("{}", { status: 200 }); } });
    expect(result).toMatchObject({ status: "exported", exported: 1 });
    expect(bodies[0]).toMatchObject({ id: "trace-faithfulness", value: .5, traceId: "trace" });
    expect(JSON.stringify(bodies)).not.toContain("private email");
  });
  it("keeps score export failure visible", async () => {
    const result = await exportNumericScores({ baseUrl: "https://example.test", publicKey: "p", secretKey: "s", traceId: "t", scores: [{ name: "m", value: 1 }], fetcher: async () => new Response("", { status: 503 }) });
    expect(result).toMatchObject({ status: "partial", exported: 0, failed: 1 });
  });
  it("batches numeric scores and treats unacknowledged events as failures", async () => {
    let requests = 0;
    const result = await exportNumericScoreBatch({ baseUrl: "https://example.test", publicKey: "p", secretKey: "s", traceId: "trace",
      scores: [{ name: "a", value: 1 }, { name: "b", value: 0 }], fetcher: async (_url, init) => {
        requests++; const body = JSON.parse(String(init?.body));
        expect(body.batch).toHaveLength(2);
        return Response.json({ successes: [{ id: "trace-a" }], errors: [{ id: "trace-b" }] }, { status: 207 });
      } });
    expect(requests).toBe(1);
    expect(result).toEqual({ status: "partial", exported: 1, failed: 1 });
  });
});
