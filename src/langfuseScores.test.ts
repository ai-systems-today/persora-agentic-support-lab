import { describe, expect, it } from "vitest";
import { exportNumericScores } from "../supabase/functions/_shared/langfuseScores";
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
});
