// Runs the real handler/graph with controlled network responses. Not a live-model benchmark.
const project = "https://candidate-test.supabase.co";
Deno.env.set("SUPABASE_URL", project);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
Deno.env.set("AZURE_OPENAI_API_KEY", "test-evaluator-key");
Deno.env.set("AZURE_OPENAI_ENDPOINT", "https://candidate-test.openai.azure.com");
let handler: (req: Request) => Promise<Response>;
Object.defineProperty(Deno, "serve", { value: (fn: typeof handler) => { handler = fn; } });
const originalFetch = globalThis.fetch;
let mode = "pass";
let hydrationCount = 0;
const source = "Update your Netflix Household from a TV connected to your home internet.";
const draft = "Update your Netflix Household from a TV connected to your home internet [#1].";
globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (target.endsWith("/.well-known/agent-card.json")) return Response.json({ name: "Test specialist", version: "1.0" });
  if (target.endsWith("/message:send")) {
    const requestBody = JSON.parse(String((init as { body?: unknown })?.body));
    const taskId = crypto.randomUUID();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))), b => b.toString(16).padStart(2, "0")).join("");
    const capture = { schemaVersion: "1.0", requestId: taskId + "-1", searches: [], passages: [{ id: null, documentId: null, label: "Household", text: source, rank: 1 }], generatorContext: source, generatorContextHash: hash, generatorContextCaptured: true, retrievalMs: 12, embeddingMs: null, documentSearchMs: null, backendVersion: "test", corpusVersion: "test" };
    return Response.json({ task: { id: taskId, contextId: requestBody.message.messageId, artifacts: [{ parts: [{ text: draft }], metadata: {
      citations: [{ index: 1, title: "Household", url: "https://help.netflix.com/en/node/128339", snippet: source }],
      specialists: [{ domain: "household", agentId: "test-agent", agentName: "Test specialist", widgetId: "test-widget" }], retrievalCaptures: [capture],
    } }] } });
  }
  if (target.includes("orchestrate-chat")) {
    const citations = [{ index: 1, chunk_id: "00000000-0000-0000-0000-000000000001", title: "Household", url: "https://help.netflix.com/en/node/128339", snippet: source }];
    const traceId = new Headers((init as { headers?: HeadersInit })?.headers).get("x-trace-id");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))), b => b.toString(16).padStart(2, "0")).join("");
    const capture = { schemaVersion: "1.0", requestId: traceId, searches: [{ query: "Netflix Household TV", method: "hybrid", topK: 5, filters: {}, durationMs: 12, status: "success", scopeValid: true }], passages: [{ id: citations[0].chunk_id, documentId: null, label: "Household", text: source, rank: 1, citationIndex: 1 }], generatorContext: source, generatorContextHash: hash, generatorContextCaptured: true, retrievalMs: 12, embeddingMs: null, documentSearchMs: null, backendVersion: "test-upstream", corpusVersion: "test-corpus" };
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: draft } }] })}\n\ndata: ${JSON.stringify({ type: "citations", citations })}\n\ndata: ${JSON.stringify({ type: "evaluation_retrieval_evidence", evidence: capture })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
  }
  if (target.includes("document_chunks")) { hydrationCount++; return Response.json([{ id: "00000000-0000-0000-0000-000000000001", content: source }]); }
  if (target.includes("get_agentic_demo_secrets")) return Response.json({});
  if (target.includes("chat/completions")) {
    if (mode === "unavailable") return new Response("", { status: 503 });
    const request = JSON.parse(String((init as { body?: unknown })?.body));
    const exact = JSON.parse(request.messages[1].content);
    const rejected = mode === "unsupported" && exact.answer === draft;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ faithfulness: rejected ? .5 : 1, responseRelevancy: 1, contextPrecision: 1,
      contextRecall: null, factualCorrectness: null, reasons: {}, unsupportedClaims: rejected ? ["An unsupported draft statement"] : [], relevantContextIndices: [1, 1] }) } }] });
  }
  throw new Error(`Unmocked external request: ${new URL(target).pathname}`);
};
await import("./index.ts");
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const request = (sse = false, message = "How do I update my Netflix Household from my TV?") => new Request(`${project}/functions/v1/agentic-support-demo`, { method: "POST", headers: { Origin: "http://localhost:5173", "Content-Type": "application/json", ...(sse ? { Accept: "text/event-stream" } : {}) },
  body: JSON.stringify({ message, sessionToken: crypto.randomUUID() }) });

Deno.test("candidate handler preserves exact evidence and controls final answer", async t => {
  await t.step("passes with captured generator passages and bounded relevance fraction", async () => {
    mode = "pass"; hydrationCount = 0;
    const response = await handler(request());
    const payload = await response.json();
    check(response.ok, "Candidate handler failed");
    check(payload.answer === draft, "Passing draft changed");
    check(hydrationCount === 0, "Captured evidence was unnecessarily hydrated");
    check(payload.evidence.integrations.ragas.metrics.contextPrecision === 1, "Duplicate indices inflated metric");
    check(payload.evidence.evaluationSnapshot.generatorContextCaptured === true, "Captured generator evidence lost");
    check(payload.evidence.evaluationSnapshot.decision.action === "deliver", "Wrong decision");
    check(!payload.evidence.privateEvaluationEvidence, "Private generator context leaked to public caller");
  });
  await t.step("withholds unsupported draft and hashes the final answer separately", async () => {
    mode = "unsupported";
    const payload = await (await handler(request())).json();
    check(payload.evidence.draftEvaluation.status === "failed", "Draft failure erased");
    check(payload.evidence.evaluationSnapshot.draftAnswer === draft, "Original answer lost");
    check(payload.evidence.evaluationSnapshot.decision.action === "fallback", "Unsupported draft delivered");
    check(payload.answer !== draft, "Fallback missing");
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload.answer)));
    const hash = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    check(payload.evidence.integrations.ragas.inputHashes.answer === hash, "Final score describes another answer");
  });
  await t.step("qualifies unavailable evaluation and streams the same decision", async () => {
    mode = "unavailable";
    const response = await handler(request(true));
    const stream = await response.text();
    const events = stream.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
    const content = events.find(e => e.type === "TEXT_MESSAGE_CONTENT");
    const evidence = events.find(e => e.type === "CUSTOM" && e.name === "persora.evidence").value.evidence;
    check(content.delta.startsWith("Verification warning:"), "Unavailable judge presented as verified");
    check(evidence.integrations.ragas.status === "not-evaluated", "Failure turned into zero/pass");
    check(evidence.evaluationSnapshot.finalAnswer === content.delta, "Stream answer differs from evidence");
    check(evidence.evaluationSnapshot.decision.action === "qualify", "Decision missing");
  });
  await t.step("withholds an unsupported A2A group answer", async () => {
    mode = "unsupported";
    const payload = await (await handler(request(false, "My household verification fails and I cannot access my account email."))).json();
    check(payload.evidence.pattern === "group-chat", "Group route did not execute");
    check(payload.evidence.draftEvaluation.status === "failed", "Group draft failure was lost");
    check(payload.evidence.evaluationSnapshot.decision.action === "fallback", "Group knowledge bypassed the response decision");
    check(payload.answer !== draft, "Unsupported group answer was delivered");
  });
  globalThis.fetch = originalFetch;
});
