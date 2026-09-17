import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cases } from "./data";

describe("demo evidence", () => {
  it("provides five distinct cases", () => {
    expect(cases).toHaveLength(5);
    expect(new Set(cases.map((item) => item.answer)).size).toBe(5);
    expect(cases.map((item) => item.pattern)).toContain("group-chat");
  });

  it("provides all five evidence layers for every case", () => {
    for (const item of cases) {
      expect(item.layers.map((layer) => layer.id)).toEqual([
        "orchestration",
        "content",
        "interaction",
        "observability",
        "quality",
      ]);
    }
  });

  it("does not claim optional integrations executed in fixture mode", () => {
    const optional = cases.flatMap((item) => item.layers).flatMap((layer) => layer.fields)
      .filter((entry) => /LangGraph|Pinecone|Milvus|Neo4j|AG-UI|A2A|Langfuse|RAGAS/i.test(`${entry.label} ${entry.value} ${entry.detail}`));
    expect(optional.length).toBeGreaterThan(0);
    expect(optional.every((entry) => entry.status === "not-captured" || entry.status === "not-executed")).toBe(true);
  });

  it("keeps Langfuse proof conditional on an accepted OTLP export", () => {
    const source = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    expect(source).toContain("/api/public/otel/v1/traces");
    expect(source).toContain("if (!response.ok)");
    expect(source).toContain("configured: false, executed: false");
    expect(source).toMatch(/configured:\s*true,\s*executed:\s*true/);
  });

  it("retrieves Langfuse credentials through the allow-listed Vault RPC", () => {
    const source = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../supabase/migrations/20260916150545_add_agentic_demo_vault_reader.sql", import.meta.url), "utf8");
    expect(source).toContain("/rest/v1/rpc/get_agentic_demo_secrets");
    expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(migration).toContain("caller_role <> 'service_role'");
    expect(migration).toContain("revoke all on function public.get_agentic_demo_secrets() from public");
    expect(migration).toContain("grant execute on function public.get_agentic_demo_secrets() to service_role");
  });

  it("defines distinct runtime branches and standards-based interaction contracts", () => {
    const orchestrator = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    const specialist = readFileSync(new URL("../supabase/functions/netflix-specialist-a2a/index.ts", import.meta.url), "utf8");
    for (const node of ["concurrent_privacy_checks", "human_handoff", "group_a2a_specialist", "recovery_planner"]) {
      expect(orchestrator).toContain(`.addNode("${node}"`);
    }
    for (const event of ["RUN_STARTED", "TEXT_MESSAGE_CONTENT", "SUBAGENT_STARTED", "ACTIVITY_SNAPSHOT", "RUN_FINISHED"]) {
      expect(orchestrator).toContain(`type: "${event}"`);
    }
    expect(specialist).toContain("/.well-known/agent-card.json");
    expect(specialist).toContain("/message:send");
    expect(specialist).toContain('"A2A-Version": A2A_VERSION');
  });

  it("runs the pinned RAGAS benchmark before the Pages build", () => {
    const workflow = readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
    const requirements = readFileSync(new URL("../requirements-eval.txt", import.meta.url), "utf8");
    const result = JSON.parse(readFileSync(new URL("./generated/ragas-evaluation.json", import.meta.url), "utf8"));
    expect(workflow).toContain("python scripts/evaluate_ragas.py");
    expect(requirements).toContain("ragas==0.4.3");
    expect(result).toMatchObject({ executed: true, scope: "benchmark", version: "0.4.3", sampleCount: 5 });
  });
});
