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
    expect(specialist).toContain("selectSpecialists(message)");
    expect(specialist).toContain("specialists: result.specialists");
    expect(specialist).toContain("shiftCitationReferences");
  });

  it("runs the pinned RAGAS benchmark before the Pages build", () => {
    const workflow = readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
    const requirements = readFileSync(new URL("../requirements-eval.txt", import.meta.url), "utf8");
    const result = JSON.parse(readFileSync(new URL("./generated/ragas-evaluation.json", import.meta.url), "utf8"));
    expect(workflow).toContain("python scripts/evaluate_ragas.py");
    expect(requirements).toContain("ragas==0.4.3");
    expect(result).toMatchObject({ executed: true, scope: "benchmark", version: "0.4.3", sampleCount: 5, metricCount: 6 });
    expect(Object.keys(result.cases)).toEqual(["grounded-answer", "access-blocked", "approval-required", "group-chat", "recovery"]);
    expect(Object.keys(result.cases["grounded-answer"].scores)).toEqual(Object.keys(result.scores));
    expect(Object.keys(result.scores)).toEqual([
      "non_llm_string_similarity",
      "required_phrase_presence",
      "exact_match",
      "bleu_score",
      "chrf_score",
      "rouge_l",
    ]);
  });

  it("returns a sanitized public trace and keeps the private Langfuse URL out of the evidence payload", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const orchestrator = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    expect(orchestrator).toContain("publicTrace");
    expect(orchestrator).toContain("privateObservabilityExported");
    expect(orchestrator).toContain("langfuse: { ...langfuse, traceUrl: null }");
    expect(orchestrator).toContain("persora.telemetry.redaction");
    expect(orchestrator).toContain("[REDACTED_PAYMENT_NUMBER]");
    expect(orchestrator).toContain("/api/public/v2/observations?traceId=");
    expect(orchestrator).toContain('observations.length ? "available" : "pending"');
    expect(orchestrator).not.toContain("for (const delayMs of [0])");
    expect(orchestrator).not.toContain("record.input");
    expect(orchestrator).not.toContain("record.output");
    expect(app).toContain("Public trace projection");
    expect(app).toContain("Private Langfuse mirror");
    expect(app).not.toContain("open it in Langfuse");
  });

  it("exposes the transparent routing decision with the run evidence", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const orchestrator = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    expect(orchestrator).toContain("selectOrchestrationPattern");
    expect(orchestrator).toContain('name: "persora.orchestration.route"');
    expect(orchestrator).toContain('strategy: "deterministic-policy-router"');
    expect(orchestrator).toContain('agUi: { executed: false, version: "1.0", eventCount: 0 }');
    expect(app).toContain('selected === "sequential"');
  });

  it("keeps group-chat and human approval claims aligned with runtime behavior", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const orchestrator = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../supabase/migrations/20260917080958_add_agentic_demo_approvals.sql", import.meta.url), "utf8");
    expect(app).toContain("distinct A2A specialist results");
    expect(app).toContain("Approve safe continuation");
    expect(app).toContain("Live exact-run RAG evaluation");
    expect(app).toContain('langfuse?.readback === "failed"');
    expect(app).toContain("correctness was not invented");
    expect(orchestrator).toContain("session-bound-demo-decision");
    expect(orchestrator).toContain("no account was cancelled and no refund was issued");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.agentic_demo_approvals from public, anon, authenticated");
  });

  it("streams graph progress and preserves truthful evidence labels", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const orchestrator = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    expect(orchestrator).toContain('graph.stream(input, { streamMode: "updates" })');
    expect(orchestrator).toContain('"persora.followups"');
    expect(orchestrator).toContain("retrievalEvidence(result.citations)");
    expect(orchestrator).toContain('entry.node === "published_netflix_agent"');
    expect(app).toContain("LIVE ORCHESTRATION");
    expect(app).toContain("Selected execution node");
    expect(app).toContain("retrieval-only latency not captured");
    expect(app).toContain("Continue this conversation");
  });

  it("validates each published answer, retries once, and fails closed", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const orchestrator = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    const a2a = readFileSync(new URL("../supabase/functions/netflix-specialist-a2a/index.ts", import.meta.url), "utf8");
    expect(orchestrator).toContain("evaluateLiveAnswer");
    expect(orchestrator).toContain("requestPublishedAgent(state, true)");
    expect(orchestrator).toContain("This is the one repair attempt");
    expect(orchestrator).toContain("live_quality_failed_closed");
    expect(orchestrator).toContain("I couldn’t verify a sufficiently grounded answer");
    expect(orchestrator).toContain("a2a_required_for_group_chat");
    expect(orchestrator).toContain("not presenting a single-agent fallback as an orchestrated answer");
    expect(orchestrator).toContain("failure.error?.message");
    expect(app).toContain("Exact-run quality gate");
    expect(app).toContain("Citation validity");
    expect(app).toContain("Reference-dependent correctness");
    expect(orchestrator).toContain('addNode("exact_run_evaluation"');
    expect(orchestrator).toContain("evaluateExactRun");
    expect(orchestrator).not.toContain("extractGroundedClaims(first.answer");
    expect(orchestrator).not.toContain("stabilizeGroundedMarkdown(firstAnswer");
    expect(orchestrator).not.toContain("stabilizeGroundedMarkdown(repairedAnswer");
    expect(orchestrator).toContain("live_rag_evaluation_repair_passed");
    expect(orchestrator).toContain("live_rag_evaluation_candidate_rejected");
    expect(orchestrator).toContain("live_rag_evaluation_unavailable_failed_closed");
    expect(orchestrator).toContain("The generated candidate failed the live exact-run evaluator");
    expect(orchestrator).toContain("ragas: ragas.executed ? ragas : notEvaluatedLiveRag(rejectionReason)");
    expect(orchestrator).toContain("executed: ragas.executed");
    expect(orchestrator).toContain("citations: update.citations ?? state.citations");
    expect(a2a).toContain("stabilizeGroundedMarkdown");
  });

  it("routes agentic questions to distinct published Persora specialist widgets", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const orchestrator = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    const a2a = readFileSync(new URL("../supabase/functions/netflix-specialist-a2a/index.ts", import.meta.url), "utf8");
    const router = readFileSync(new URL("../supabase/functions/_shared/specialistRouter.ts", import.meta.url), "utf8");
    expect(orchestrator).toContain("selectPrimarySpecialist(state.message)");
    expect(orchestrator).toContain("specialist: result.specialist");
    expect(a2a).toContain("selectSpecialists(message)");
    expect(a2a).toContain("specialists: result.specialists");
    expect(a2a).toContain("failed the exact-run quality gate after one repair attempt");
    expect(router).toContain('domain: "billing"');
    expect(router).toContain('domain: "household"');
    expect(router).toContain('domain: "identity"');
    expect(app).toContain("Executed specialist agents");
    expect(app).toContain("Agent steps");
    expect(app).not.toContain("<span>Agents</span>");
  });

  it("returns run evidence for concurrency and bounded planner decisions", () => {
    const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const orchestrator = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    const proof = readFileSync(new URL("../supabase/functions/_shared/orchestrationProof.ts", import.meta.url), "utf8");
    expect(proof).toContain("const checks = await Promise.all");
    expect(proof).toContain("overlapMs > 0");
    expect(proof).toContain('decision: "revise"');
    expect(proof).toContain('decision: "finish"');
    expect(proof).toContain("maxIterations: 2");
    expect(orchestrator).toContain("executeRemoteConcurrentCheck");
    expect(orchestrator).toContain('action: "concurrent-check"');
    expect(orchestrator).toContain("planRecoveryEvidence(state.message)");
    expect(orchestrator).toContain("state.specialistContext.trim()");
    expect(orchestrator).toContain("Follow this bounded orchestration plan");
    expect(orchestrator).toContain("specialistRetrievalHint(state.message)");
    expect(orchestrator).toContain("requestVerifiedKnowledgeFallback(state.message)");
    expect(orchestrator).toContain("live_quality_verified_kb_fallback_passed");
    expect(app).toContain("Pattern execution proof");
    expect(app).toContain("planner decisions");
  });

  it("suppresses blocked prompts before any Langfuse configuration or export", () => {
    const orchestrator = readFileSync(new URL("../supabase/functions/agentic-support-demo/index.ts", import.meta.url), "utf8");
    expect(orchestrator).toContain("result.allowed\n          ? await emitLangfuseTrace");
    expect(orchestrator).toContain("suppressedLangfuseEvidence()");
    expect(orchestrator).toContain("Suppressed because the authorization guardrail blocked the request before telemetry export");
  });
});
