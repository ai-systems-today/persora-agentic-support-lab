import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Annotation, END, START, StateGraph } from "npm:@langchain/langgraph@1.4.15";
import { evaluateLiveAnswer, notEvaluatedQuality, type LiveQuality, type QualityCitation } from "../_shared/answerQuality.ts";
import { citationEvidenceText, normalizeCitationBundle } from "../_shared/citationEvidence.ts";
import { evaluateExactRun, notEvaluatedLiveRag, referenceForQuestion, type LiveRagEvaluation } from "../_shared/liveRagEvaluation.ts";
import { evaluateConcurrentCheck, planRecoveryEvidence, runConcurrentChecks, type ConcurrentCheckName, type OrchestrationProof } from "../_shared/orchestrationProof.ts";
import { selectOrchestrationPattern, type Pattern } from "../_shared/orchestrationRouter.ts";
import { selectPrimarySpecialist, specialistRetrievalHint, type SpecialistSelection } from "../_shared/specialistRouter.ts";
import { passesQuestionSpecificAnswerContract, verifiedKnowledgeAnswer, verifiedKnowledgeRequiredText, verifiedKnowledgeTopic } from "../_shared/verifiedKnowledgeFallback.ts";

const ALLOWED_ORIGINS = new Set([
  "https://ai-systems-today.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const UPSTREAM = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/orchestrate-chat";
const A2A_SPECIALIST = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/netflix-specialist-a2a";
const PROMPT_VERSION = "netflix-support-demo@2026-09-19.3-generalization";
const LANGGRAPH_VERSION = "1.4.15";
const NETFLIX_KB_CONVERSATION_ID = "6983a1ed-a545-4cfd-a00b-d4d785914217";
const VERIFIED_POLICY_FILENAME = "netflix-household-travel-official-policy.md";

const secureEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
};

async function signReadback(traceId: string, sessionToken: string): Promise<string | null> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${sessionToken}:${traceId}:langfuse-readback`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type TraceEntry = { node: string; status: "complete" | "blocked" | "failed"; durationMs: number };
type ProtocolEvent = Record<string, unknown> & { type: string; timestamp?: string };
type A2AEvidence = {
  executed: boolean;
  version: string;
  agentName: string | null;
  taskId: string | null;
  specialists: SpecialistSelection[];
  error: string | null;
};
type LangfuseEvidence = {
  configured: boolean;
  executed: boolean;
  traceId: string | null;
  traceUrl: string | null;
  error: string | null;
  readback: "available" | "pending" | "failed" | "not-attempted";
  observations: Array<{
    name: string;
    type: string;
    status: string | null;
    durationMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    totalCost: number | null;
  }>;
  readbackToken: string | null;
};
type LangfuseConfig = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
};

const suppressedLangfuseEvidence = (): LangfuseEvidence => ({
  configured: false,
  executed: false,
  traceId: null,
  traceUrl: null,
  error: "Suppressed because the authorization guardrail blocked the request before telemetry export",
  readback: "not-attempted",
  observations: [],
  readbackToken: null,
});

const State = Annotation.Root({
  message: Annotation<string>,
  sessionToken: Annotation<string>,
  deviceId: Annotation<string>,
  traceId: Annotation<string>,
  threadId: Annotation<string>,
  origin: Annotation<string>,
  pattern: Annotation<Pattern>,
  routeReason: Annotation<string>,
  routeSignals: Annotation<string[]>({ reducer: (_left, right) => right, default: () => [] }),
  routeConfidence: Annotation<number>,
  allowed: Annotation<boolean>,
  guardrailReason: Annotation<string>,
  answer: Annotation<string>,
  citations: Annotation<unknown[]>({ reducer: (_left, right) => right, default: () => [] }),
  eventTypes: Annotation<string[]>({ reducer: (left, right) => [...left, ...right], default: () => [] }),
  nodeTrace: Annotation<TraceEntry[]>({ reducer: (left, right) => [...left, ...right], default: () => [] }),
  protocolEvents: Annotation<ProtocolEvent[]>({ reducer: (left, right) => [...left, ...right], default: () => [] }),
  specialistContext: Annotation<string>,
  specialistCitations: Annotation<unknown[]>({ reducer: (_left, right) => right, default: () => [] }),
  specialist: Annotation<SpecialistSelection | null>,
  handoffRequired: Annotation<boolean>,
  handoffSummary: Annotation<string>,
  a2a: Annotation<A2AEvidence>,
  quality: Annotation<LiveQuality>,
  ragas: Annotation<LiveRagEvaluation>,
  orchestrationProof: Annotation<OrchestrationProof>,
});

const buildFollowUps = (pattern: Pattern, citations: unknown[]): string[] => {
  const cited = citations.length > 0;
  const questions: Record<Pattern, string[]> = {
    sequential: [
      "How do I update my Netflix Household from the primary TV?",
      "What can I do if temporary travel access is unavailable?",
      cited ? "Which cited Netflix article should I follow first?" : "When should I contact authenticated support?",
    ],
    concurrent: [
      "How can the account owner view their own billing history?",
      "What information should I prepare for authenticated support?",
      "Why was retrieval skipped for this request?",
    ],
    "group-chat": [
      "Which issue should I resolve first: email access, billing country, or household verification?",
      "What did the A2A specialist contribute to this answer?",
      cited ? "Which sources support the recommended recovery sequence?" : "When is a human specialist required?",
    ],
    handoff: [
      "What exactly requires human approval?",
      "What information is included in the handoff summary?",
      "What happens if the approval is rejected?",
    ],
    magentic: [
      "Which recovery step should I try next?",
      "What details should I include when escalating to support?",
      cited ? "Which cited source explains the alternative route?" : "Why should I stop repeating the failed code?",
    ],
  };
  return questions[pattern];
};

const retrievalEvidence = (citations: unknown[]) => ({
  provider: "Persora KB · Supabase/Postgres vectors",
  returnedCount: citations.length,
  durationMs: null,
  results: citations.map((value, index) => {
    const citation = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    const url = typeof citation.url === "string"
      ? citation.url
      : typeof citation.source_url === "string" ? citation.source_url : null;
    const label = [citation.title, citation.source, citation.filename]
      .find((candidate) => typeof candidate === "string") as string | undefined;
    const snippet = [citation.snippet, citation.content, citation.text]
      .find((candidate) => typeof candidate === "string") as string | undefined;
    const similarity = typeof citation.similarity === "number"
      ? citation.similarity
      : typeof citation.score === "number" ? citation.score : null;
    return { rank: index + 1, label: label ?? `Source ${index + 1}`, url, snippet: snippet ?? null, similarity };
  }),
});

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

async function requestPublishedAgent(state: typeof State.State, repair: boolean) {
  const question = state.pattern === "group-chat"
    ? "Give one verified step for each of these Netflix issues: billing, Netflix Household, and account email access."
    : state.message;
  const qualityInstruction = "Answer completely but concisely in Markdown. Use a short heading and bullets or numbered steps when they improve clarity. Every bullet must be a complete, self-contained sentence that names its subject; never begin with a dangling transition or pronoun whose referent is missing. Begin directly with the cited facts or steps: do not add an uncited introduction, transition, or conclusion. Headings may be uncited, but every factual sentence or bullet must end with its matching [#n] citation. Use only facts directly stated in the returned Netflix knowledge sources. Do not add uncited factual clauses or external links. If the sources do not support an answer, say only: I do not have enough source evidence.";
  const approvedReference = referenceForQuestion(state.message);
  const retrievalHint = specialistRetrievalHint(state.message);
  const orchestrationInstruction = state.specialistContext.trim()
    ? ` Follow this bounded orchestration plan: ${state.specialistContext.trim()}`
    : "";
  const retrievalInstruction = retrievalHint ? ` Retrieval guidance: ${retrievalHint}` : "";
  const completenessInstruction = approvedReference
    ? ` This approved benchmark requires every source-supported point in this completeness target: ${approvedReference.answer}`
    : "";
  const repairInstruction = repair
    ? " This is the one repair attempt. Rewrite the whole answer from scratch so it directly answers the user's exact question. Preserve every source-supported step needed to answer it, remove unsupported material, and end every factual sentence with the matching [#n] citation. Do not return a heading or background note without the requested steps."
    : "";
  const specialist = selectPrimarySpecialist(state.message);
  const response = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": state.origin,
      "x-trace-id": state.traceId,
    },
    body: JSON.stringify({
      widgetId: specialist.widgetId,
      message: `${question}\n\n${qualityInstruction}${completenessInstruction}${orchestrationInstruction}${retrievalInstruction}${repairInstruction}`,
      sessionToken: `${state.sessionToken}:${state.traceId}:${repair ? "retry" : "primary"}`,
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
  return { ...normalizeCitationBundle(stream.answer.trim(), stream.citations), eventTypes: stream.eventTypes, specialist };
}

async function qualityCitations(values: unknown[]): Promise<QualityCitation[]> {
  const chunkIds = values.map((value) => {
    const citation = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    return typeof citation.chunk_id === "string" && /^[0-9a-f-]{36}$/i.test(citation.chunk_id) ? citation.chunk_id : null;
  }).filter((value): value is string => value !== null);
  const fullContent = new Map<string, string>();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (chunkIds.length && serviceRoleKey) {
    try {
      const response = await fetch(`https://oiotkbbwriecdvtnufee.supabase.co/rest/v1/document_chunks?id=in.(${chunkIds.join(",")})&select=id,content`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (response.ok) {
        const rows = await response.json() as Array<{ id?: unknown; content?: unknown }>;
        for (const row of rows) if (typeof row.id === "string" && typeof row.content === "string") fullContent.set(row.id, row.content);
      }
    } catch {
      // The deterministic gate fails closed against returned citation evidence if hydration is unavailable.
    }
  }
  return values.map((value, index) => {
  const citation = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const label = [citation.title, citation.source, citation.filename]
    .find((candidate) => typeof candidate === "string");
  const chunkId = typeof citation.chunk_id === "string" ? citation.chunk_id : null;
  const snippet = chunkId && fullContent.has(chunkId) ? fullContent.get(chunkId)! : citationEvidenceText(value);
  return {
    label: typeof label === "string" ? label : `Source ${index + 1}`,
    url: typeof citation.url === "string" ? citation.url : typeof citation.source_url === "string" ? citation.source_url : null,
    snippet,
  };
  });
}

async function requestVerifiedKnowledgeFallback(message: string) {
  const topic = verifiedKnowledgeTopic(message);
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!topic || !serviceRoleKey) return null;
  const params = new URLSearchParams({
    conversation_id: `eq.${NETFLIX_KB_CONVERSATION_ID}`,
    "metadata->>filename": `eq.${VERIFIED_POLICY_FILENAME}`,
    select: "id,chunk_index,content,metadata",
    order: "chunk_index.asc",
  });
  const response = await fetch(`https://oiotkbbwriecdvtnufee.supabase.co/rest/v1/document_chunks?${params.toString()}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) return null;
  const rows = await response.json() as Array<{
    id?: unknown;
    content?: unknown;
    metadata?: Record<string, unknown> | null;
  }>;
  const requiredText = verifiedKnowledgeRequiredText(topic);
  const row = rows.find((candidate) => typeof candidate.content === "string" && candidate.content.includes(requiredText));
  if (!row || typeof row.id !== "string" || typeof row.content !== "string") return null;
  const metadata = row.metadata ?? {};
  const citation = {
    index: 1,
    chunk_id: row.id,
    filename: VERIFIED_POLICY_FILENAME,
    title: typeof metadata.heading === "string" ? metadata.heading : "Netflix Household and travel: verified support facts",
    source_url: typeof metadata.url === "string" ? metadata.url : null,
    snippet: row.content,
  };
  return {
    answer: verifiedKnowledgeAnswer(topic),
    citations: [citation],
    eventTypes: ["verified_shared_kb_fallback_used"],
    specialist: selectPrimarySpecialist(message),
  };
}

const MULTI_INTENT_QUALITY_TOPICS: Record<SpecialistSelection["domain"], { label: string; terms: string[] }> = {
  billing: { label: "billing", terms: ["billing", "payment", "currency", "charge", "invoice", "membership"] },
  household: { label: "household", terms: ["household", "TV", "home internet"] },
  identity: { label: "identity", terms: ["email", "password", "sign in", "login"] },
  general: { label: "general support", terms: ["support", "help"] },
};

const requiredQualityTopics = (state: typeof State.State) => state.pattern === "group-chat"
  ? state.a2a.specialists.map((specialist) => MULTI_INTENT_QUALITY_TOPICS[specialist.domain])
  : referenceForQuestion(state.message)?.requiredTopics ?? [];

async function callPublishedAgent(state: typeof State.State) {
  type PublishedResult = { answer: string; citations: unknown[]; eventTypes: string[]; specialist: SpecialistSelection | null };
  let first: PublishedResult | null = null;
  const requiredTopics = requiredQualityTopics(state);
  if (state.pattern === "group-chat" && !state.a2a.executed) {
    const answer = "I couldn’t complete the required specialist exchange for this multi-topic request, so I’m not presenting a single-agent fallback as an orchestrated answer. Please retry or ask the billing, Household, and account-access questions separately.";
    return {
      answer,
      citations: [],
      specialist: null,
      quality: evaluateLiveAnswer({ question: state.message, answer, citations: [], retryCount: 0, requiredTopics }),
      eventTypes: ["a2a_required_for_group_chat", "live_quality_multi_intent_failed_closed"],
    };
  }
  try {
    first = state.pattern === "group-chat" && state.specialistContext.trim() && state.specialistCitations.length
      ? {
        answer: state.specialistContext,
        citations: state.specialistCitations,
        eventTypes: ["a2a_grounded_result_used"],
        specialist: null,
      }
      : await requestPublishedAgent(state, false);
  } catch {
    first = null;
  }

  if (first) {
    const firstCitations = await qualityCitations(first.citations);
    const firstAnswer = first.answer.trim();
    const firstQuality = evaluateLiveAnswer({
      question: state.message,
      answer: firstAnswer,
      citations: firstCitations,
      retryCount: 0,
      requiredTopics,
    });
    if (firstQuality.status === "passed" && passesQuestionSpecificAnswerContract(state.message, firstAnswer)) {
      return { ...first, answer: firstAnswer, quality: firstQuality, eventTypes: [...first.eventTypes, "live_quality_passed"] };
    }
    if (state.pattern === "group-chat") {
      return {
        answer: "I couldn’t verify a source-backed answer for every part of this multi-topic request, so I’m not presenting a partial answer as complete. Please ask the billing, Household, and sign-in questions separately or use authenticated Netflix Support.",
        citations: first.citations,
        specialist: null,
        quality: firstQuality,
        eventTypes: [...first.eventTypes, "live_quality_multi_intent_failed_closed"],
      };
    }
  }

  let repaired: PublishedResult;
  try {
    repaired = await requestPublishedAgent(state, true);
  } catch {
    const fallbackCitations = first?.citations ?? [];
    return {
      answer: "I couldn’t verify a sufficiently grounded answer from the returned Netflix sources, so I’m not presenting the generated answer as reliable. Please rephrase the question or use authenticated Netflix Support.",
      citations: fallbackCitations,
      specialist: first?.specialist ?? selectPrimarySpecialist(state.message),
      quality: evaluateLiveAnswer({ question: state.message, answer: "", citations: await qualityCitations(fallbackCitations), retryCount: 1 }),
      eventTypes: [...(first?.eventTypes ?? []), "live_quality_retry_request_failed", "live_quality_failed_closed"],
    };
  }
  const repairedCitations = await qualityCitations(repaired.citations);
  const repairedAnswer = repaired.answer.trim();
  const repairedQuality = evaluateLiveAnswer({
    question: state.message,
    answer: repairedAnswer,
    citations: repairedCitations,
    retryCount: 1,
    requiredTopics,
  });
  if (repairedQuality.status === "passed" && passesQuestionSpecificAnswerContract(state.message, repairedAnswer)) {
    return { ...repaired, answer: repairedAnswer, quality: repairedQuality, eventTypes: [...repaired.eventTypes, ...(first ? [] : ["live_quality_initial_request_failed"]), "live_quality_retry_passed"] };
  }

  const verifiedFallback = await requestVerifiedKnowledgeFallback(state.message);
  if (verifiedFallback) {
    const verifiedCitations = await qualityCitations(verifiedFallback.citations);
    const verifiedQuality = evaluateLiveAnswer({
      question: state.message,
      answer: verifiedFallback.answer,
      citations: verifiedCitations,
      retryCount: 1,
      requiredTopics,
    });
    if (verifiedQuality.status === "passed" && passesQuestionSpecificAnswerContract(state.message, verifiedFallback.answer)) {
      return {
        ...verifiedFallback,
        quality: verifiedQuality,
        eventTypes: [...repaired.eventTypes, ...verifiedFallback.eventTypes, "live_quality_verified_kb_fallback_passed"],
      };
    }
  }

  return {
    answer: "I couldn’t verify a sufficiently grounded answer from the returned Netflix sources, so I’m not presenting the generated answer as reliable. Please rephrase the question or use authenticated Netflix Support.",
    citations: repaired.citations,
    specialist: repaired.specialist,
    quality: repairedQuality,
    eventTypes: [...repaired.eventTypes, ...(first ? [] : ["live_quality_initial_request_failed"]), "live_quality_failed_closed"],
  };
}

const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
  .map((value) => value.toString(16).padStart(2, "0"))
  .join("");

const sha256 = async (value: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
).map((byte) => byte.toString(16).padStart(2, "0")).join("");

type ApprovalDecision = "approve" | "reject";
type ApprovalRecord = { id: string; status: "pending" | "approved" | "rejected"; decided_at: string | null; decision_message: string | null; summary: string };

const adminHeaders = () => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!serviceRoleKey) throw new Error("Service-role credential unavailable");
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
};

async function createApproval(input: { traceId: string; threadId: string; message: string; summary: string }): Promise<ApprovalRecord> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) throw new Error("Supabase URL unavailable");
  const response = await fetch(`${supabaseUrl}/rest/v1/agentic_demo_approvals`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ trace_id: input.traceId, thread_id: input.threadId, request_message: input.message, summary: input.summary }),
  });
  if (!response.ok) throw new Error(`Approval persistence returned HTTP ${response.status}`);
  const rows = await response.json() as ApprovalRecord[];
  if (!rows[0]?.id) throw new Error("Approval persistence returned no record");
  return rows[0];
}

async function decideApproval(input: { approvalId: string; threadId: string; decision: ApprovalDecision }): Promise<ApprovalRecord> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (!supabaseUrl) throw new Error("Supabase URL unavailable");
  const status = input.decision === "approve" ? "approved" : "rejected";
  const decisionMessage = input.decision === "approve"
    ? "Demo approval recorded. The case may continue to authenticated Netflix support; no account was cancelled and no refund was issued."
    : "Demo rejection recorded. The workflow ended without changing the Netflix account or issuing a refund.";
  const query = new URLSearchParams({ id: `eq.${input.approvalId}`, thread_id: `eq.${input.threadId}`, status: "eq.pending" });
  const response = await fetch(`${supabaseUrl}/rest/v1/agentic_demo_approvals?${query}`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify({ status, decision_message: decisionMessage, decided_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Approval decision returned HTTP ${response.status}`);
  const rows = await response.json() as ApprovalRecord[];
  if (!rows[0]?.id) throw new Error("Approval is missing, belongs to another demo session, or was already decided");
  return rows[0];
}

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
    return { configured: false, executed: false, traceId: null, traceUrl: null, error: loaded.error, readback: "not-attempted", observations: [], readbackToken: null };
  }
  const { publicKey, secretKey, baseUrl } = loaded.config;

  const traceId = randomHex(16);
  const rootSpanId = randomHex(8);
  const sessionId = (await sha256(input.sessionToken)).slice(0, 32);
  const redactForTelemetry = (value: string) => value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_PAYMENT_NUMBER]")
    .replace(/\b(?:account|customer|invoice)[-_: ]+[A-Z0-9]{6,}\b/gi, "[REDACTED_IDENTIFIER]");
  const traceInput = input.guardrailDecision === "block"
    ? { question: "[REDACTED_BY_AUTHORIZATION_GUARDRAIL]" }
    : { question: redactForTelemetry(input.message) };
  const traceAnswer = redactForTelemetry(input.answer);
  const endNanos = BigInt(Date.now()) * 1_000_000n;
  const startNanos = endNanos - BigInt(Math.max(input.totalMs, 1)) * 1_000_000n;
  let cursorNanos = startNanos;
  const childSpans = input.nodeTrace.map((entry) => {
    const isGeneration = entry.node === "published_netflix_agent" || entry.node === "group_a2a_specialist";
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
        otelAttribute("langfuse.observation.type", isGeneration ? "generation" : "span"),
        otelAttribute("persora.node.status", entry.status),
        otelAttribute("persora.node.duration_ms", entry.durationMs),
        ...(isGeneration ? [
          otelAttribute("langfuse.observation.input", JSON.stringify(traceInput)),
          otelAttribute("langfuse.observation.output", JSON.stringify({
            answer: entry.node === "published_netflix_agent" ? traceAnswer : "A2A task artifact returned",
          })),
        ] : []),
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
      otelAttribute("langfuse.observation.output", JSON.stringify({ answer: traceAnswer })),
      otelAttribute("langfuse.session.id", sessionId),
      otelAttribute("langfuse.trace.name", "persora-netflix-support"),
      otelAttribute("langfuse.trace.tags", JSON.stringify(["interview-demo", input.pattern])),
      otelAttribute("langfuse.version", PROMPT_VERSION),
      otelAttribute("persora.request.trace_id", input.requestTraceId),
      otelAttribute("persora.pattern", input.pattern),
      otelAttribute("persora.guardrail.decision", input.guardrailDecision),
      otelAttribute("persora.citation_count", input.citations.length),
      otelAttribute("persora.telemetry.redaction", true),
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
      readback: "pending",
      observations: [],
      readbackToken: await signReadback(traceId, input.sessionToken),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Langfuse export failed";
    console.error(JSON.stringify({ requestTraceId: input.requestTraceId, integration: "langfuse", error: message }));
    return { configured: true, executed: false, traceId, traceUrl: null, error: message, readback: "not-attempted", observations: [], readbackToken: null };
  }
}

const emptyA2A = (): A2AEvidence => ({
  executed: false,
  version: "1.0",
  agentName: null,
  taskId: null,
  specialists: [],
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
    if (!response.ok) {
      let detail = "";
      try {
        const failure = await response.json() as { error?: { code?: unknown; message?: unknown } };
        const code = typeof failure.error?.code === "string" ? failure.error.code : "";
        const candidate = typeof failure.error?.message === "string" ? failure.error.message : "";
        const safeMessage = /^Published (?:billing|household|identity|general) specialist [\w\s-]{1,160}$/i.test(candidate)
          ? candidate
          : "";
        detail = [code, safeMessage].filter(Boolean).join(": ");
      } catch {
        // Preserve the HTTP status when the upstream error is not JSON.
      }
      throw new Error(`A2A message:send returned HTTP ${response.status}${detail ? ` (${detail})` : ""}`);
    }
    const payload = await response.json() as {
      task?: { id?: unknown; artifacts?: Array<{ parts?: Array<{ text?: unknown }>; metadata?: { citations?: unknown; specialists?: unknown } }> };
    };
    const context = payload.task?.artifacts?.flatMap((artifact) => artifact.parts ?? [])
      .map((part) => typeof part.text === "string" ? part.text : "")
      .filter(Boolean)
      .join("\n") ?? "";
    if (!context) throw new Error("A2A specialist returned no text artifact");
    const citations = payload.task?.artifacts?.flatMap((artifact) => Array.isArray(artifact.metadata?.citations) ? artifact.metadata.citations : []) ?? [];
    if (!citations.length) throw new Error("A2A specialist returned no source citations");
    const specialists = payload.task?.artifacts?.flatMap((artifact) => Array.isArray(artifact.metadata?.specialists) ? artifact.metadata.specialists : [])
      .filter((value): value is SpecialistSelection => {
        if (!value || typeof value !== "object") return false;
        const record = value as Record<string, unknown>;
        return typeof record.domain === "string" && typeof record.agentId === "string" && typeof record.agentName === "string" && typeof record.widgetId === "string";
      }) ?? [];
    if (!specialists.length) throw new Error("A2A specialist returned no executed specialist identities");
    const taskId = typeof payload.task?.id === "string" ? payload.task.id : null;
    const agentName = typeof card.name === "string" ? card.name : "Netflix Support Specialist";
    return {
      specialistContext: context,
      specialistCitations: citations,
      a2a: { executed: true, version: typeof card.version === "string" ? card.version : "1.0", agentName, taskId, specialists, error: null },
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

async function executeRemoteConcurrentCheck(state: typeof State.State, name: ConcurrentCheckName, message: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Concurrent check runtime credentials unavailable");
  const response = await fetch(`${supabaseUrl}/functions/v1/agentic-support-demo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      Origin: state.origin,
      "Content-Type": "application/json",
      "x-trace-id": `${state.traceId}-${name === "Privacy policy check" ? "privacy" : "alternative"}`,
    },
    body: JSON.stringify({ action: "concurrent-check", checkName: name, message }),
  });
  if (!response.ok) throw new Error(`Concurrent ${name} returned HTTP ${response.status}`);
  const payload = await response.json() as { result?: unknown };
  if (typeof payload.result !== "string") throw new Error(`Concurrent ${name} returned no result`);
  return payload.result;
}

async function runConcurrentPrivacyChecks(state: typeof State.State) {
  const concurrent = await runConcurrentChecks(
    state.message,
    (name, message) => executeRemoteConcurrentCheck(state, name, message),
  );
  return {
    answer: "I can’t access or disclose another customer’s payment card, invoices, or account information. The account owner can sign in to view billing history, or an authenticated support case can be opened without exposing sensitive data.",
    eventTypes: ["concurrent_checks_completed", "guardrail_blocked"],
    orchestrationProof: {
      ...state.orchestrationProof,
      concurrent,
    },
    protocolEvents: concurrent.checks.map((check) => ({
      type: "CUSTOM",
      name: "persora.concurrent.check",
      value: { name: check.name, durationMs: check.durationMs, result: check.result },
    })),
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
  const recovery = planRecoveryEvidence(state.message);
  return {
    specialistContext: "The temporary travel-access path failed. Retrieve source-backed alternatives for mobile devices, computers, and hotel or holiday-rental TVs, note country availability when the source supports it, and do not invent diagnostic causes.",
    eventTypes: recovery.revised ? ["recovery_plan_revised", "recovery_plan_finished"] : ["recovery_plan_finished"],
    orchestrationProof: {
      ...state.orchestrationProof,
      recovery,
    },
    protocolEvents: recovery.iterations.map((iteration) => ({
      type: "ACTIVITY_SNAPSHOT",
      messageId: `${state.traceId}-recovery-plan-${iteration.attempt}`,
      activityType: "PLAN",
      content: {
        attempt: iteration.attempt,
        decision: iteration.decision,
        reason: iteration.reason,
        attempted: ["temporary travel code"],
        next: ["mobile device", "computer", "hotel or holiday-rental TV", "country availability"],
      },
      replace: iteration.attempt > 1,
    })),
  };
}

async function runExactEvaluation(state: typeof State.State) {
  if (state.quality.status !== "passed" || !state.answer.trim() || !state.citations.length) {
    return {
      ragas: notEvaluatedLiveRag("This route did not produce a retrieved knowledge answer."),
      eventTypes: ["live_rag_evaluation_not_applicable"],
    };
  }
  const apiKey = Deno.env.get("AZURE_OPENAI_API_KEY")?.trim();
  const endpoint = (Deno.env.get("AZURE_OPENAI_ENDPOINT") ?? "https://ai-genaiappshub118707119222.openai.azure.com").trim();
  if (!apiKey) {
    const rejectedAnswer = "I couldn’t verify a complete source-backed answer for this question, so I’m not presenting the generated candidate as reliable. Please try rephrasing the question.";
    return {
      answer: rejectedAnswer,
      citations: [],
      quality: evaluateLiveAnswer({
        question: state.message,
        answer: rejectedAnswer,
        citations: [],
        retryCount: 1,
        requiredTopics: requiredQualityTopics(state),
      }),
      ragas: notEvaluatedLiveRag("Azure evaluator credentials are unavailable."),
      eventTypes: ["live_rag_evaluation_unavailable_failed_closed"],
    };
  }
  const qualityContext = await qualityCitations(state.citations);
  const allContexts = qualityContext
    .map((citation, index) => `[#${index + 1}] ${citation.label}\n${citation.snippet ?? ""}`.trim());
  const contexts = allContexts;
  let ragas = await evaluateExactRun({
    question: state.message,
    answer: state.answer,
    contexts,
    reference: referenceForQuestion(state.message),
    endpoint,
    apiKey,
    model: "gpt-4o-mini",
  });
  if (ragas.executed && ragas.status === "passed") {
    return {
      ragas,
      eventTypes: ["live_rag_evaluation_passed"],
      protocolEvents: [{
        type: "CUSTOM",
        name: "persora.evaluation.exact-run",
        value: {
          executed: ragas.executed,
          status: ragas.status,
          evaluatorVersion: ragas.evaluatorVersion,
          referenceId: ragas.referenceId,
          inputHashes: ragas.inputHashes,
        },
      }],
    };
  }

  const alreadyRepaired = state.eventTypes.some((event) =>
    event === "live_quality_retry_passed" ||
    event === "live_quality_verified_kb_fallback_passed"
  );
  if (!alreadyRepaired && state.pattern !== "group-chat") {
    try {
      const repaired = await requestPublishedAgent(state, true);
      const repairedCitations = await qualityCitations(repaired.citations);
      const repairedAnswer = repaired.answer.trim();
      const repairedQuality = evaluateLiveAnswer({
        question: state.message,
        answer: repairedAnswer,
        citations: repairedCitations,
        retryCount: 1,
        requiredTopics: requiredQualityTopics(state),
      });
      if (repairedQuality.status === "passed" && passesQuestionSpecificAnswerContract(state.message, repairedAnswer)) {
        const repairedContexts = repairedCitations
          .map((citation, index) => `[#${index + 1}] ${citation.label}\n${citation.snippet ?? ""}`.trim());
        const repairedRagas = await evaluateExactRun({
          question: state.message,
          answer: repairedAnswer,
          contexts: repairedContexts,
          reference: referenceForQuestion(state.message),
          endpoint,
          apiKey,
          model: "gpt-4o-mini",
        });
        if (repairedRagas.executed && repairedRagas.status === "passed") {
          return {
            answer: repairedAnswer,
            citations: repaired.citations,
            specialist: repaired.specialist,
            quality: repairedQuality,
            ragas: repairedRagas,
            eventTypes: [...repaired.eventTypes, "live_rag_evaluation_repair_passed"],
            protocolEvents: [{
              type: "CUSTOM",
              name: "persora.evaluation.exact-run",
              value: {
                executed: true,
                status: "passed",
                evaluatorVersion: repairedRagas.evaluatorVersion,
                referenceId: repairedRagas.referenceId,
                inputHashes: repairedRagas.inputHashes,
              },
            }],
          };
        }
        ragas = repairedRagas;
      }
    } catch {
      // The final response below fails closed when the evaluator repair cannot complete.
    }
  }

  const rejectionReason = ragas.executed
    ? "The generated candidate failed the live exact-run evaluator and was not shown as a verified answer."
    : "The live exact-run evaluator was unavailable, so the generated candidate was not shown as verified.";
  const rejectedAnswer = "I couldn’t verify a complete source-backed answer for this question, so I’m not presenting the generated candidate as reliable. Please try rephrasing the question.";
  return {
    answer: rejectedAnswer,
    citations: [],
    quality: evaluateLiveAnswer({
      question: state.message,
      answer: rejectedAnswer,
      citations: [],
      retryCount: 1,
      requiredTopics: requiredQualityTopics(state),
    }),
    ragas: notEvaluatedLiveRag(rejectionReason),
    eventTypes: [
      ragas.executed ? "live_rag_evaluation_candidate_rejected" : "live_rag_evaluation_unavailable_failed_closed",
    ],
    protocolEvents: [{
      type: "CUSTOM",
      name: "persora.evaluation.exact-run",
      value: {
        executed: false,
        status: "not-evaluated",
        evaluatorVersion: ragas.evaluatorVersion,
        referenceId: null,
        inputHashes: null,
        rejectedCandidateStatus: ragas.status,
      },
    }],
  };
}

const graph = new StateGraph(State)
  .addNode("intake", timed("intake", (state) => {
    const route = selectOrchestrationPattern(state.message);
    return {
      pattern: route.pattern,
      routeReason: route.reason,
      routeSignals: route.signals,
      routeConfidence: route.confidence,
      eventTypes: ["orchestration_route_selected"],
      protocolEvents: [{
        type: "CUSTOM",
        name: "persora.orchestration.route",
        value: route,
      }],
    };
  }))
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
    return {
      eventTypes: [
        "answer_present",
        state.citations.length ? "citations_present" : "citations_absent",
        state.quality.status === "not-evaluated" ? "live_quality_not_evaluated" : `live_quality_${state.quality.status}`,
      ],
    };
  }))
  .addNode("exact_run_evaluation", timed("exact_run_evaluation", runExactEvaluation))
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
  .addEdge("response_validation", "exact_run_evaluation")
  .addEdge("exact_run_evaluation", END)
  .compile();

function agUiEvents(input: {
  threadId: string;
  runId: string;
  answer: string;
  graphEvents: ProtocolEvent[];
  evidence: Record<string, unknown>;
  citations: unknown[];
  handoffRequired: boolean;
  followUps?: string[];
}): ProtocolEvent[] {
  const messageId = `${input.runId}-assistant`;
  const now = new Date().toISOString();
  return [
    { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId, timestamp: now },
    ...input.graphEvents,
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant", timestamp: now },
    { type: "TEXT_MESSAGE_CONTENT", messageId, delta: input.answer, timestamp: now },
    { type: "TEXT_MESSAGE_END", messageId, timestamp: now },
    ...(input.followUps?.length ? [{ type: "CUSTOM", name: "persora.followups", value: { questions: input.followUps }, timestamp: now }] : []),
    { type: "CUSTOM", name: "persora.evidence", value: { evidence: input.evidence, citations: input.citations }, timestamp: now },
    input.handoffRequired
      ? { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: { type: "interrupt", interrupts: [{ id: `${input.runId}-human-approval`, reason: "human_approval" }] }, timestamp: now }
      : { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId, outcome: { type: "success" }, timestamp: now },
  ];
}

const encodeEvent = (event: ProtocolEvent) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

const nextNodeFor = (node: string, state: typeof State.State): string | null => {
  if (node === "intake") return "authorization_guardrail";
  if (node === "authorization_guardrail") {
    if (!state.allowed) return "concurrent_privacy_checks";
    if (state.pattern === "handoff") return "human_handoff";
    if (state.pattern === "group-chat") return "group_a2a_specialist";
    if (state.pattern === "magentic") return "recovery_planner";
    return "published_netflix_agent";
  }
  if (node === "group_a2a_specialist" || node === "recovery_planner") return "published_netflix_agent";
  if (node === "concurrent_privacy_checks" || node === "human_handoff" || node === "published_netflix_agent") return "response_validation";
  if (node === "response_validation") return "exact_run_evaluation";
  return null;
};

const mergeGraphUpdate = (
  state: typeof State.State,
  update: Partial<typeof State.State>,
): typeof State.State => ({
  ...state,
  ...update,
  citations: update.citations ?? state.citations,
  eventTypes: update.eventTypes ? [...state.eventTypes, ...update.eventTypes] : state.eventTypes,
  nodeTrace: update.nodeTrace ? [...state.nodeTrace, ...update.nodeTrace] : state.nodeTrace,
  protocolEvents: update.protocolEvents ? [...state.protocolEvents, ...update.protocolEvents] : state.protocolEvents,
});

function streamAgenticRun(input: typeof State.State, origin: string, started: number) {
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: ProtocolEvent) => controller.enqueue(encodeEvent({ ...event, timestamp: event.timestamp ?? new Date().toISOString() }));
      const messageId = `${input.traceId}-assistant`;
      let result = input;
      try {
        emit({ type: "RUN_STARTED", threadId: input.threadId, runId: input.traceId });
        emit({ type: "STEP_STARTED", stepName: "intake" });
        const execution = await graph.stream(input, { streamMode: "updates" });
        for await (const chunk of execution as AsyncIterable<Record<string, Partial<typeof State.State>>>) {
          for (const [node, update] of Object.entries(chunk)) {
            result = mergeGraphUpdate(result, update);
            for (const event of update.protocolEvents ?? []) {
              if (event.type !== "STEP_STARTED" && event.type !== "STEP_FINISHED") emit(event);
            }
            emit({ type: "STEP_FINISHED", stepName: node });
            const next = nextNodeFor(node, result);
            if (next) emit({ type: "STEP_STARTED", stepName: next });
          }
        }

        const totalMs = Math.round(performance.now() - started);
        const approval = result.handoffRequired
          ? await createApproval({ traceId: input.traceId, threadId: input.threadId, message: input.message, summary: result.handoffSummary })
          : null;
        const langfuse = result.allowed
          ? await emitLangfuseTrace({
            requestTraceId: input.traceId,
            message: input.message,
            answer: result.answer,
            sessionToken: input.sessionToken,
            pattern: result.pattern,
            guardrailDecision: "allow",
            citations: result.citations,
            nodeTrace: result.nodeTrace,
            totalMs,
          })
          : suppressedLangfuseEvidence();
        const followUps = buildFollowUps(result.pattern, result.citations);
        const evidence = {
          traceId: input.traceId,
          totalMs,
          eventTypes: [...result.eventTypes, "RUN_FINISHED"],
          pattern: result.pattern,
          routing: {
            strategy: "deterministic-policy-router",
            reason: result.routeReason,
            signals: result.routeSignals,
            confidence: result.routeConfidence,
          },
          specialist: result.specialist,
          promptVersion: PROMPT_VERSION,
          guardrail: { decision: result.allowed ? "allow" : "block", reason: result.guardrailReason },
          handoff: {
            required: result.handoffRequired,
            status: result.handoffRequired ? "awaiting-human" : "not-required",
            summary: result.handoffSummary || null,
            approvalId: approval?.id ?? null,
            decidedAt: null,
            decisionMessage: null,
          },
          nodeTrace: result.nodeTrace,
          protocolEvents: result.protocolEvents,
          quality: result.quality,
          orchestrationProof: result.orchestrationProof,
          followUps,
          retrieval: retrievalEvidence(result.citations),
          publicTrace: {
            schemaVersion: "1.0",
            generatedAt: new Date().toISOString(),
            nodeCount: result.nodeTrace.length,
            protocolEventCount: result.protocolEvents.length + 7,
            citationCount: result.citations.length,
            privateObservabilityExported: langfuse.executed,
          },
          integrations: {
            langGraph: { executed: true, version: LANGGRAPH_VERSION },
            langfuse: { ...langfuse, traceUrl: null },
            ragas: result.ragas,
            agUi: { executed: true, version: "1.0", eventCount: result.protocolEvents.length + 7 },
            a2a: result.a2a,
            neo4j: { executed: false, records: null },
          },
        };
        emit({ type: "TEXT_MESSAGE_START", messageId, role: "assistant" });
        emit({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: result.answer });
        emit({ type: "TEXT_MESSAGE_END", messageId });
        emit({ type: "CUSTOM", name: "persora.followups", value: { questions: followUps } });
        emit({ type: "CUSTOM", name: "persora.evidence", value: { evidence, citations: result.citations } });
        emit(result.handoffRequired
          ? { type: "RUN_FINISHED", threadId: input.threadId, runId: input.traceId, outcome: { type: "interrupt", interrupts: [{ id: `${input.traceId}-human-approval`, reason: "human_approval" }] } }
          : { type: "RUN_FINISHED", threadId: input.threadId, runId: input.traceId, outcome: { type: "success" } });
      } catch (error) {
        emit({ type: "RUN_ERROR", threadId: input.threadId, runId: input.traceId, message: error instanceof Error ? error.message : "Agentic run failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      ...cors(origin),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
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
    const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : crypto.randomUUID();
    const threadId = (await sha256(sessionToken)).slice(0, 32);
    if (body.action === "concurrent-check") {
      const message = typeof body.message === "string" ? body.message.trim() : "";
      const checkName = body.checkName === "Privacy policy check" || body.checkName === "Safe alternative check"
        ? body.checkName as ConcurrentCheckName
        : null;
      if (!message || message.length > 2000 || !checkName) {
        return new Response(JSON.stringify({ error: "A valid concurrent check and message are required" }), { status: 400, headers: { ...cors(origin), "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ result: evaluateConcurrentCheck(checkName, message) }), { headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    if (body.action === "langfuse-readback") {
      const requestedTraceId = typeof body.langfuseTraceId === "string" ? body.langfuseTraceId : "";
      const readbackToken = typeof body.readbackToken === "string" ? body.readbackToken : "";
      if (!/^[a-f0-9]{32}$/i.test(requestedTraceId)) return new Response(JSON.stringify({ error: "Invalid trace identifier" }), { status: 400, headers: { ...cors(origin), "Content-Type": "application/json" } });
      const expectedToken = await signReadback(requestedTraceId, sessionToken);
      if (!expectedToken || !secureEqual(readbackToken, expectedToken)) return new Response(JSON.stringify({ error: "Read-back proof rejected" }), { status: 403, headers: { ...cors(origin), "Content-Type": "application/json" } });
      const loaded = await loadLangfuseConfig();
      if (!loaded.config) return new Response(JSON.stringify({ readback: "failed", observations: [], error: loaded.error }), { status: 503, headers: { ...cors(origin), "Content-Type": "application/json" } });
      const authorization = `Basic ${btoa(`${loaded.config.publicKey}:${loaded.config.secretKey}`)}`;
      try {
        const observationsResponse = await fetch(`${loaded.config.baseUrl}/api/public/v2/observations?traceId=${requestedTraceId}&fields=core,basic,usage,metrics&limit=100`, { headers: { Authorization: authorization } });
        if (!observationsResponse.ok) throw new Error(`Langfuse observations returned HTTP ${observationsResponse.status}`);
        const payload = await observationsResponse.json() as { data?: unknown[] };
        const observations = (Array.isArray(payload.data) ? payload.data : []).flatMap((value) => {
          if (!value || typeof value !== "object") return [];
          const record = value as Record<string, unknown>;
          const usage = record.usageDetails && typeof record.usageDetails === "object" ? record.usageDetails as Record<string, unknown> : {};
          const cost = record.costDetails && typeof record.costDetails === "object" ? record.costDetails as Record<string, unknown> : {};
          const start = typeof record.startTime === "string" ? Date.parse(record.startTime) : NaN;
          const end = typeof record.endTime === "string" ? Date.parse(record.endTime) : NaN;
          return [{ name: typeof record.name === "string" ? record.name : "unnamed observation", type: typeof record.type === "string" ? record.type : "SPAN", status: typeof record.level === "string" ? record.level : null, durationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null, inputTokens: typeof usage.input === "number" ? usage.input : null, outputTokens: typeof usage.output === "number" ? usage.output : null, totalCost: typeof cost.total === "number" ? cost.total : null }];
        });
        return new Response(JSON.stringify({ readback: observations.length ? "available" : "pending", observations, error: null }), { headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
      } catch (error) {
        return new Response(JSON.stringify({ readback: "failed", observations: [], error: error instanceof Error ? error.message : "Langfuse read-back failed" }), { status: 502, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
      }
    }
    const approvalId = typeof body.approvalId === "string" ? body.approvalId : "";
    const decision = body.decision === "approve" || body.decision === "reject" ? body.decision as ApprovalDecision : null;

    if (approvalId && decision) {
      const record = await decideApproval({ approvalId, threadId, decision });
      const nodeTrace: TraceEntry[] = [
        { node: "human_decision", status: "complete", durationMs: Math.round(performance.now() - started) },
        { node: decision === "approve" ? "safe_continuation" : "workflow_closed", status: "complete", durationMs: 0 },
      ];
      const graphEvents: ProtocolEvent[] = [
        { type: "STEP_STARTED", stepName: "human_decision", timestamp: new Date().toISOString() },
        { type: "CUSTOM", name: "persora.handoff.decision", value: { approvalId: record.id, status: record.status }, timestamp: new Date().toISOString() },
        { type: "STEP_FINISHED", stepName: "human_decision", timestamp: new Date().toISOString() },
      ];
      const evidence = {
        traceId,
        totalMs: Math.round(performance.now() - started),
        eventTypes: ["human_decision_recorded", "RUN_FINISHED"],
        pattern: "handoff",
        specialist: null,
        promptVersion: PROMPT_VERSION,
        guardrail: { decision: "allow", reason: "session-bound-demo-decision" },
        handoff: { required: true, status: record.status, summary: record.summary, approvalId: record.id, decidedAt: record.decided_at, decisionMessage: record.decision_message },
        nodeTrace,
        protocolEvents: graphEvents,
        quality: notEvaluatedQuality("A persisted human decision is not a generated knowledge answer."),
        orchestrationProof: { concurrent: null, recovery: null },
        integrations: {
          langGraph: { executed: false, version: LANGGRAPH_VERSION },
          langfuse: { configured: false, executed: false, traceId: null, traceUrl: null, error: "Decision continuation is persisted separately from the original observed run", readback: "not-attempted", observations: [], readbackToken: null },
          ragas: notEvaluatedLiveRag("A persisted human decision is not a generated knowledge answer."),
          agUi: { executed: true, version: "1.0", eventCount: graphEvents.length + 6 },
          a2a: emptyA2A(),
          neo4j: { executed: false, records: null },
        },
      };
      return sseResponse(agUiEvents({ threadId, runId: traceId, answer: record.decision_message ?? "Decision recorded.", graphEvents, evidence, citations: [], handoffRequired: false }), origin);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 2000) return new Response(JSON.stringify({ error: "Message must contain 1-2000 characters" }), { status: 400, headers: { ...cors(origin), "Content-Type": "application/json" } });
    const initialState = {
      message,
      sessionToken,
      deviceId: typeof body.deviceId === "string" ? body.deviceId : crypto.randomUUID(),
      traceId,
      threadId,
      origin,
      pattern: "sequential" as Pattern,
      routeReason: "not-evaluated",
      routeSignals: [],
      routeConfidence: 0,
      allowed: true,
      guardrailReason: "not-evaluated",
      specialistContext: "",
      specialistCitations: [],
      specialist: null,
      answer: "",
      citations: [],
      eventTypes: [],
      nodeTrace: [],
      protocolEvents: [],
      handoffRequired: false,
      handoffSummary: "",
      a2a: emptyA2A(),
      quality: notEvaluatedQuality("No published knowledge answer has run yet."),
      ragas: notEvaluatedLiveRag("No published knowledge answer has run yet."),
      orchestrationProof: { concurrent: null, recovery: null },
    };
    if (req.headers.get("accept")?.includes("text/event-stream")) {
      return streamAgenticRun(initialState, origin, started);
    }
    const result = await graph.invoke(initialState);
    const totalMs = Math.round(performance.now() - started);
    const approval = result.handoffRequired
      ? await createApproval({ traceId, threadId, message, summary: result.handoffSummary })
      : null;
    const langfuse = result.allowed
      ? await emitLangfuseTrace({
        requestTraceId: traceId,
        message,
        answer: result.answer,
        sessionToken,
        pattern: result.pattern,
        guardrailDecision: "allow",
        citations: result.citations,
        nodeTrace: result.nodeTrace,
        totalMs,
      })
      : suppressedLangfuseEvidence();
    const evidence = {
      traceId,
      totalMs,
      eventTypes: [...result.eventTypes, "RUN_FINISHED"],
      pattern: result.pattern,
      routing: {
        strategy: "deterministic-policy-router",
        reason: result.routeReason,
        signals: result.routeSignals,
        confidence: result.routeConfidence,
      },
      specialist: result.specialist,
      promptVersion: PROMPT_VERSION,
      guardrail: { decision: result.allowed ? "allow" : "block", reason: result.guardrailReason },
      handoff: {
        required: result.handoffRequired,
        status: result.handoffRequired ? "awaiting-human" : "not-required",
        summary: result.handoffSummary || null,
        approvalId: approval?.id ?? null,
        decidedAt: null,
        decisionMessage: null,
      },
      nodeTrace: result.nodeTrace,
      protocolEvents: result.protocolEvents,
      quality: result.quality,
      orchestrationProof: result.orchestrationProof,
      followUps: buildFollowUps(result.pattern, result.citations),
      retrieval: retrievalEvidence(result.citations),
      publicTrace: {
        schemaVersion: "1.0",
        generatedAt: new Date().toISOString(),
        nodeCount: result.nodeTrace.length,
        protocolEventCount: 0,
        citationCount: result.citations.length,
        privateObservabilityExported: langfuse.executed,
      },
      integrations: {
        langGraph: { executed: true, version: LANGGRAPH_VERSION },
        langfuse: { ...langfuse, traceUrl: null },
        ragas: result.ragas,
        agUi: { executed: false, version: "1.0", eventCount: 0 },
        a2a: result.a2a,
        neo4j: { executed: false, records: null },
      },
    };
    const payload = {
      answer: result.answer,
      citations: result.citations,
      evidence,
    };
    return new Response(JSON.stringify(payload), { headers: { ...cors(origin), "Content-Type": "application/json" } });
  } catch (error) {
    console.error(JSON.stringify({ traceId, function: "agentic-support-demo", error: error instanceof Error ? error.message : "unknown" }));
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Agentic run failed", traceId }), { status: 500, headers: { ...cors(origin), "Content-Type": "application/json" } });
  }
});
