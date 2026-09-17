import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Annotation, END, START, StateGraph } from "npm:@langchain/langgraph@1.4.15";

const ALLOWED_ORIGINS = new Set([
  "https://ai-systems-today.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const UPSTREAM = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/orchestrate-chat";
const A2A_SPECIALIST = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/netflix-specialist-a2a";
const DEFAULT_WIDGET = "6a01cc31-ee9e-4977-aa8c-031894a71851";
const PROMPT_VERSION = "netflix-support-demo@2026-09-16.1";
const LANGGRAPH_VERSION = "1.4.15";

type Pattern = "sequential" | "concurrent" | "group-chat" | "handoff" | "magentic";
type TraceEntry = { node: string; status: "complete" | "blocked" | "failed"; durationMs: number };
type ProtocolEvent = Record<string, unknown> & { type: string; timestamp?: string };
type A2AEvidence = {
  executed: boolean;
  version: string;
  agentName: string | null;
  taskId: string | null;
  error: string | null;
};
type LangfuseEvidence = {
  configured: boolean;
  executed: boolean;
  traceId: string | null;
  traceUrl: string | null;
  error: string | null;
};
type LangfuseConfig = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
};

const State = Annotation.Root({
  message: Annotation<string>,
  widgetId: Annotation<string>,
  sessionToken: Annotation<string>,
  deviceId: Annotation<string>,
  traceId: Annotation<string>,
  threadId: Annotation<string>,
  origin: Annotation<string>,
  pattern: Annotation<Pattern>,
  allowed: Annotation<boolean>,
  guardrailReason: Annotation<string>,
  answer: Annotation<string>,
  citations: Annotation<unknown[]>({ reducer: (left, right) => [...left, ...right], default: () => [] }),
  eventTypes: Annotation<string[]>({ reducer: (left, right) => [...left, ...right], default: () => [] }),
  nodeTrace: Annotation<TraceEntry[]>({ reducer: (left, right) => [...left, ...right], default: () => [] }),
  protocolEvents: Annotation<ProtocolEvent[]>({ reducer: (left, right) => [...left, ...right], default: () => [] }),
  specialistContext: Annotation<string>,
  handoffRequired: Annotation<boolean>,
  handoffSummary: Annotation<string>,
  a2a: Annotation<A2AEvidence>,
});

const classifyPattern = (message: string): Pattern => {
  const text = message.toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => text.includes(term));
  const issueCount = [has("billing", "payment", "country"), has("household", "device"), has("email", "sign in", "access")].filter(Boolean).length;
  if (issueCount >= 2) return "group-chat";
  if (has("cancel", "refund")) return "handoff";
  if (has("another account", "other account", "reveal", "payment card")) return "concurrent";
  if (has("tried", "failed", "still does not", "temporary code")) return "magentic";
  return "sequential";
};

const timed = <T extends Record<string, unknown>>(
  node: string,
  run: (state: typeof State.State) => Promise<T> | T,
) => async (state: typeof State.State): Promise<T & { nodeTrace: TraceEntry[]; protocolEvents: ProtocolEvent[] }> => {
  const started = performance.now();
  const result = await run(state);
  const resultEvents = Array.isArray(result.protocolEvents) ? result.protocolEvents as ProtocolEvent[] : [];
  return {
    ...result,
    nodeTrace: [{ node, status: "complete", durationMs: Math.round(performance.now() - started) }],
    protocolEvents: [
      { type: "STEP_STARTED", stepName: node, timestamp: new Date().toISOString() },
      ...resultEvents,
      { type: "STEP_FINISHED", stepName: node, timestamp: new Date().toISOString() },
    ],
  };
};

function applySsePayload(state: { answer: string; citations: unknown[]; eventTypes: string[] }, payload: string) {
  if (!payload || payload === "[DONE]") return;
  let event: Record<string, unknown>;
  try { event = JSON.parse(payload); } catch { return; }
  const type = typeof event.type === "string" ? event.type : "message";
  if (!state.eventTypes.includes(type)) state.eventTypes.push(type);
  if (type === "citations" && Array.isArray(event.citations)) state.citations = event.citations;
  const choices = Array.isArray(event.choices) ? event.choices : [];
  const first = choices[0] as { delta?: { content?: unknown } } | undefined;
  if (typeof first?.delta?.content === "string") state.answer += first.delta.content;
}

async function callPublishedAgent(state: typeof State.State) {
  const response = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": state.origin,
      "x-trace-id": state.traceId,
    },
    body: JSON.stringify({
      widgetId: state.widgetId,
      message: state.specialistContext ? `${state.message}\n\nCase coordination context:\n${state.specialistContext}` : state.message,
      sessionToken: state.sessionToken,
      deviceId: state.deviceId,
      mode: "chat",
    }),
  });
  if (!response.ok || !response.body) throw new Error(`Published agent returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const stream = { answer: "", citations: [] as unknown[], eventTypes: [] as string[] };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.startsWith("data:")) applySsePayload(stream, line.slice(5).trim());
    if (done) break;
  }
  if (buffer.startsWith("data:")) applySsePayload(stream, buffer.slice(5).trim());
  if (!stream.answer.trim()) throw new Error("Published agent completed without answer text");
  return { answer: stream.answer.trim(), citations: stream.citations, eventTypes: stream.eventTypes };
}

const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
  .map((value) => value.toString(16).padStart(2, "0"))
  .join("");

const sha256 = async (value: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
).map((byte) => byte.toString(16).padStart(2, "0")).join("");

const otelAttribute = (key: string, value: string | number | boolean) => ({
  key,
  value: typeof value === "number"
    ? { intValue: String(Math.round(value)) }
    : typeof value === "boolean"
      ? { boolValue: value }
      : { stringValue: value },
});

async function loadLangfuseConfig(): Promise<{ config: LangfuseConfig | null; error: string | null }> {
  const environmentPublicKey = Deno.env.get("LANGFUSE_PUBLIC_KEY")?.trim();
  const environmentSecretKey = Deno.env.get("LANGFUSE_SECRET_KEY")?.trim();
  const environmentBaseUrl = (
    Deno.env.get("LANGFUSE_BASE_URL")?.trim() ||
    Deno.env.get("LANGFUSE_HOST")?.trim() ||
    "https://cloud.langfuse.com"
  ).replace(/\/$/, "");

  if (environmentPublicKey && environmentSecretKey) {
    return {
      config: {
        publicKey: environmentPublicKey,
        secretKey: environmentSecretKey,
        baseUrl: environmentBaseUrl,
      },
      error: null,
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) return { config: null, error: null };

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_agentic_demo_secrets`, {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!response.ok) throw new Error(`Vault RPC returned HTTP ${response.status}`);

    const secrets = await response.json() as Record<string, unknown>;
    const publicKey = typeof secrets.persora_langfuse_public_key === "string"
      ? secrets.persora_langfuse_public_key.trim()
      : "";
    const secretKey = typeof secrets.persora_langfuse_secret_key === "string"
      ? secrets.persora_langfuse_secret_key.trim()
      : "";
    const baseUrl = (
      typeof secrets.persora_langfuse_base_url === "string"
        ? secrets.persora_langfuse_base_url.trim()
        : environmentBaseUrl
    ).replace(/\/$/, "");

    return publicKey && secretKey
      ? { config: { publicKey, secretKey, baseUrl }, error: null }
      : { config: null, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vault lookup failed";
    return { config: null, error: message };
  }
}

async function emitLangfuseTrace(input: {
  requestTraceId: string;
  message: string;
  answer: string;
  sessionToken: string;
  pattern: Pattern;
  guardrailDecision: "allow" | "block";
  citations: unknown[];
  nodeTrace: TraceEntry[];
  totalMs: number;
}): Promise<LangfuseEvidence> {
  const loaded = await loadLangfuseConfig();
  if (!loaded.config) {
    return { configured: false, executed: false, traceId: null, traceUrl: null, error: loaded.error };
  }
  const { publicKey, secretKey, baseUrl } = loaded.config;

  const traceId = randomHex(16);
  const rootSpanId = randomHex(8);
  const sessionId = (await sha256(input.sessionToken)).slice(0, 32);
  const traceInput = input.guardrailDecision === "block"
    ? { question: "[REDACTED_BY_AUTHORIZATION_GUARDRAIL]" }
    : { question: input.message };
  const endNanos = BigInt(Date.now()) * 1_000_000n;
  const startNanos = endNanos - BigInt(Math.max(input.totalMs, 1)) * 1_000_000n;
  let cursorNanos = startNanos;
  const childSpans = input.nodeTrace.map((entry) => {
    const spanStart = cursorNanos;
    const spanEnd = spanStart + BigInt(Math.max(entry.durationMs, 1)) * 1_000_000n;
    cursorNanos = spanEnd;
    return {
      traceId,
      spanId: randomHex(8),
      parentSpanId: rootSpanId,
      name: entry.node,
      kind: 1,
      startTimeUnixNano: String(spanStart),
      endTimeUnixNano: String(spanEnd > endNanos ? endNanos : spanEnd),
      attributes: [
        otelAttribute("langfuse.observation.type", "span"),
        otelAttribute("persora.node.status", entry.status),
        otelAttribute("persora.node.duration_ms", entry.durationMs),
      ],
      status: { code: entry.status === "failed" ? 2 : 1 },
    };
  });
  const rootSpan = {
    traceId,
    spanId: rootSpanId,
    name: "persora-netflix-support",
    kind: 1,
    startTimeUnixNano: String(startNanos),
    endTimeUnixNano: String(endNanos),
    attributes: [
      otelAttribute("langfuse.observation.type", "span"),
      otelAttribute("langfuse.observation.input", JSON.stringify(traceInput)),
      otelAttribute("langfuse.observation.output", JSON.stringify({ answer: input.answer })),
      otelAttribute("langfuse.session.id", sessionId),
      otelAttribute("langfuse.trace.name", "persora-netflix-support"),
      otelAttribute("langfuse.trace.tags", JSON.stringify(["interview-demo", input.pattern])),
      otelAttribute("langfuse.version", PROMPT_VERSION),
      otelAttribute("persora.request.trace_id", input.requestTraceId),
      otelAttribute("persora.pattern", input.pattern),
      otelAttribute("persora.guardrail.decision", input.guardrailDecision),
      otelAttribute("persora.citation_count", input.citations.length),
    ],
    status: { code: 1 },
  };

  try {
    const response = await fetch(`${baseUrl}/api/public/otel/v1/traces`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${publicKey}:${secretKey}`)}`,
        "Content-Type": "application/json",
        "x-langfuse-ingestion-version": "4",
      },
      body: JSON.stringify({
        resourceSpans: [{
          resource: { attributes: [otelAttribute("service.name", "persora-agentic-support-lab")] },
          scopeSpans: [{ scope: { name: "persora-agentic-support-demo", version: PROMPT_VERSION }, spans: [rootSpan, ...childSpans] }],
        }],
      }),
    });
    if (!response.ok) throw new Error(`Langfuse OTLP returned HTTP ${response.status}`);
    return {
      configured: true,
      executed: true,
      traceId,
      traceUrl: `${baseUrl}/trace/${traceId}`,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Langfuse export failed";
    console.error(JSON.stringify({ requestTraceId: input.requestTraceId, integration: "langfuse", error: message }));
    return { configured: true, executed: false, traceId, traceUrl: null, error: message };
  }
}

const emptyA2A = (): A2AEvidence => ({
  executed: false,
  version: "1.0",
  agentName: null,
  taskId: null,
  error: null,
});

async function runA2ASpecialist(state: typeof State.State) {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!serviceRoleKey) {
    return { specialistContext: "", a2a: { ...emptyA2A(), error: "Service-role credential unavailable" } };
  }

  try {
    const headers = { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey };
    const cardResponse = await fetch(`${A2A_SPECIALIST}/.well-known/agent-card.json`, { headers });
    if (!cardResponse.ok) throw new Error(`Agent Card returned HTTP ${cardResponse.status}`);
    const card = await cardResponse.json() as { name?: unknown; version?: unknown };
    const response = await fetch(`${A2A_SPECIALIST}/message:send`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/a2a+json",
        "A2A-Version": "1.0",
      },
      body: JSON.stringify({
        message: {
          messageId: crypto.randomUUID(),
          role: "ROLE_USER",
          parts: [{ text: state.message }],
        },
        configuration: { acceptedOutputModes: ["text/plain"] },
      }),
    });
    if (!response.ok) throw new Error(`A2A message:send returned HTTP ${response.status}`);
    const payload = await response.json() as {
      task?: { id?: unknown; artifacts?: Array<{ parts?: Array<{ text?: unknown }> }> };
    };
    const context = payload.task?.artifacts?.flatMap((artifact) => artifact.parts ?? [])
      .map((part) => typeof part.text === "string" ? part.text : "")
      .filter(Boolean)
      .join("\n") ?? "";
    if (!context) throw new Error("A2A specialist returned no text artifact");
    const taskId = typeof payload.task?.id === "string" ? payload.task.id : null;
    const agentName = typeof card.name === "string" ? card.name : "Netflix Support Specialist";
    return {
      specialistContext: context,
      a2a: { executed: true, version: typeof card.version === "string" ? card.version : "1.0", agentName, taskId, error: null },
      eventTypes: ["a2a_task_completed"],
      protocolEvents: [
        { type: "SUBAGENT_STARTED", subagentRunId: taskId ?? state.traceId, name: agentName, description: "A2A Netflix support specialist" },
        { type: "SUBAGENT_FINISHED", subagentRunId: taskId ?? state.traceId, result: { taskId }, outcome: { type: "success" } },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "A2A specialist exchange failed";
    return { specialistContext: "", a2a: { ...emptyA2A(), error: message }, eventTypes: ["a2a_task_failed"] };
  }
}

async function runConcurrentPrivacyChecks(state: typeof State.State) {
  const [policy, safeAlternative] = await Promise.all([
    Promise.resolve("Cross-account billing data is denied before retrieval."),
    Promise.resolve("Offer the account owner an authenticated billing-history path."),
  ]);
  const first = `${state.traceId}-privacy`;
  const second = `${state.traceId}-alternative`;
  return {
    answer: "I can’t access or disclose another customer’s payment card, invoices, or account information. The account owner can sign in to view billing history, or an authenticated support case can be opened without exposing sensitive data.",
    eventTypes: ["concurrent_checks_completed", "guardrail_blocked"],
    protocolEvents: [
      { type: "SUBAGENT_STARTED", subagentRunId: first, name: "Privacy policy check", description: policy },
      { type: "SUBAGENT_STARTED", subagentRunId: second, name: "Safe alternative check", description: safeAlternative },
      { type: "SUBAGENT_FINISHED", subagentRunId: first, outcome: { type: "success" } },
      { type: "SUBAGENT_FINISHED", subagentRunId: second, outcome: { type: "success" } },
    ],
  };
}

function prepareHumanHandoff() {
  const summary = "Authenticated support must confirm the account owner, cancellation scope and refund eligibility before any account mutation.";
  return {
    answer: "I can explain the cancellation steps, but I won’t claim the account was changed or a refund was issued. I prepared a bounded handoff summary for an authenticated support agent; the workflow is paused until a human authorizes any account or payment action.",
    handoffRequired: true,
    handoffSummary: summary,
    eventTypes: ["handoff_requested", "human_approval_required"],
  };
}

function planRecovery(state: typeof State.State) {
  return {
    specialistContext: "Recovery planner: the temporary travel-code path already failed. Do not repeat it indefinitely; diagnose device time, network, expiry and primary-household access, then escalate with attempted steps.",
    eventTypes: ["recovery_plan_created"],
    protocolEvents: [{
      type: "ACTIVITY_SNAPSHOT",
      messageId: `${state.traceId}-recovery-plan`,
      activityType: "PLAN",
      content: { attempted: ["temporary travel code"], next: ["device time", "network", "code expiry", "household update", "support handoff"] },
      replace: true,
    }],
  };
}

const graph = new StateGraph(State)
  .addNode("intake", timed("intake", (state) => ({ pattern: classifyPattern(state.message) })))
  .addNode("authorization_guardrail", timed("authorization_guardrail", (state) => {
    const blocked = /another account|other account|someone else|reveal.*(?:card|invoice)|payment card/i.test(state.message);
    return { allowed: !blocked, guardrailReason: blocked ? "cross-account-sensitive-data" : "support-question-allowed" };
  }))
  .addNode("concurrent_privacy_checks", timed("concurrent_privacy_checks", runConcurrentPrivacyChecks))
  .addNode("human_handoff", timed("human_handoff", prepareHumanHandoff))
  .addNode("group_a2a_specialist", timed("group_a2a_specialist", runA2ASpecialist))
  .addNode("recovery_planner", timed("recovery_planner", planRecovery))
  .addNode("published_netflix_agent", timed("published_netflix_agent", callPublishedAgent))
  .addNode("response_validation", timed("response_validation", (state) => {
    if (!state.answer.trim()) throw new Error("Answer validation failed");
    return { eventTypes: ["answer_present", state.citations.length ? "citations_present" : "citations_absent"] };
  }))
  .addEdge(START, "intake")
  .addEdge("intake", "authorization_guardrail")
  .addConditionalEdges("authorization_guardrail", (state) => {
    if (!state.allowed) return "concurrent";
    if (state.pattern === "handoff") return "handoff";
    if (state.pattern === "group-chat") return "group";
    if (state.pattern === "magentic") return "recovery";
    return "answer";
  }, {
    concurrent: "concurrent_privacy_checks",
    handoff: "human_handoff",
    group: "group_a2a_specialist",
    recovery: "recovery_planner",
    answer: "published_netflix_agent",
  })
  .addEdge("concurrent_privacy_checks", "response_validation")
  .addEdge("human_handoff", "response_validation")
  .addEdge("group_a2a_specialist", "published_netflix_agent")
  .addEdge("recovery_planner", "published_netflix_agent")
  .addEdge("published_netflix_agent", "response_validation")
  .addEdge("response_validation", END)
  .compile();

function agUiEvents(input: {
  threadId: string;
  runId: string;
  answer: string;
  graphEvents: ProtocolEvent[];
  evidence: Record<string, unknown>;
  citations: unknown[];
  handoffRequired: boolean;
}): ProtocolEvent[] {
  const messageId = `${input.runId}-assistant`;
  const now = new Date().toISOString();
  return [
    { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId, timestamp: now },
    ...input.graphEvents,
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant", timestamp: now },
    { type: "TEXT_MESSAGE_CONTENT", messageId, delta: input.answer, timestamp: now },
    { type: "TEXT_MESSAGE_END", messageId, timestamp: now },
    { type: "CUSTOM", name: "persora.evidence", value: { evidence: input.evidence, citations: input.citations }, timestamp: now },
    input.handoffRequired
      ? { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: { type: "interrupt", interrupts: [{ id: `${input.runId}-human-approval`, reason: "human_approval" }] }, timestamp: now }
      : { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: { type: "success" }, timestamp: now },
  ];
}

function sseResponse(events: ProtocolEvent[], origin: string) {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, {
    headers: {
      ...cors(origin),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-trace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors(origin), "Content-Type": "application/json" } });

  const started = performance.now();
  const traceId = req.headers.get("x-trace-id") ?? crypto.randomUUID();
  try {
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 2000) return new Response(JSON.stringify({ error: "Message must contain 1-2000 characters" }), { status: 400, headers: { ...cors(origin), "Content-Type": "application/json" } });
    const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : crypto.randomUUID();
    const threadId = (await sha256(sessionToken)).slice(0, 32);
    const result = await graph.invoke({
      message,
      widgetId: typeof body.widgetId === "string" ? body.widgetId : DEFAULT_WIDGET,
      sessionToken,
      deviceId: typeof body.deviceId === "string" ? body.deviceId : crypto.randomUUID(),
      traceId,
      threadId,
      origin,
      allowed: true,
      guardrailReason: "not-evaluated",
      specialistContext: "",
      answer: "",
      citations: [],
      eventTypes: [],
      nodeTrace: [],
      protocolEvents: [],
      handoffRequired: false,
      handoffSummary: "",
      a2a: emptyA2A(),
    });
    const totalMs = Math.round(performance.now() - started);
    const langfuse = await emitLangfuseTrace({
      requestTraceId: traceId,
      message,
      answer: result.answer,
      sessionToken,
      pattern: result.pattern,
      guardrailDecision: result.allowed ? "allow" : "block",
      citations: result.citations,
      nodeTrace: result.nodeTrace,
      totalMs,
    });
    const evidence = {
      traceId,
      totalMs,
      eventTypes: [...result.eventTypes, "RUN_FINISHED"],
      pattern: result.pattern,
      promptVersion: PROMPT_VERSION,
      guardrail: { decision: result.allowed ? "allow" : "block", reason: result.guardrailReason },
      handoff: {
        required: result.handoffRequired,
        status: result.handoffRequired ? "awaiting-human" : "not-required",
        summary: result.handoffSummary || null,
      },
      nodeTrace: result.nodeTrace,
      protocolEvents: result.protocolEvents,
      integrations: {
        langGraph: { executed: true, version: LANGGRAPH_VERSION },
        langfuse,
        ragas: { executed: false, scope: null, version: null, sampleCount: null, scores: null },
        agUi: { executed: true, version: "1.0", eventCount: result.protocolEvents.length + 6 },
        a2a: result.a2a,
        neo4j: { executed: false, records: null },
      },
    };
    const payload = {
      answer: result.answer,
      citations: result.citations,
      evidence,
    };
    if (req.headers.get("accept")?.includes("text/event-stream")) {
      return sseResponse(agUiEvents({
        threadId,
        runId: traceId,
        answer: result.answer,
        graphEvents: result.protocolEvents,
        evidence,
        citations: result.citations,
        handoffRequired: result.handoffRequired,
      }), origin);
    }
    return new Response(JSON.stringify(payload), { headers: { ...cors(origin), "Content-Type": "application/json" } });
  } catch (error) {
    console.error(JSON.stringify({ traceId, function: "agentic-support-demo", error: error instanceof Error ? error.message : "unknown" }));
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Agentic run failed", traceId }), { status: 500, headers: { ...cors(origin), "Content-Type": "application/json" } });
  }
});
