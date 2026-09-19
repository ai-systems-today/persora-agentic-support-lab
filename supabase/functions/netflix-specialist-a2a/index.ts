import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { evaluateLiveAnswer, type QualityCitation } from "../_shared/answerQuality.ts";
import { citationEvidenceText, normalizeCitationBundle } from "../_shared/citationEvidence.ts";
import { selectSpecialists, specialistTaskMessage, type SpecialistSelection } from "../_shared/specialistRouter.ts";

const UPSTREAM = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/orchestrate-chat";
const AGENT_URL = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/netflix-specialist-a2a";
const A2A_VERSION = "1.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/a2a+json",
      "A2A-Version": A2A_VERSION,
    },
  });
}

function applySsePayload(state: { answer: string; citations: unknown[] }, payload: string) {
  if (!payload || payload === "[DONE]") return;
  let event: Record<string, unknown>;
  try { event = JSON.parse(payload); } catch { return; }
  if (event.type === "citations" && Array.isArray(event.citations)) state.citations = event.citations;
  const choices = Array.isArray(event.choices) ? event.choices : [];
  const first = choices[0] as { delta?: { content?: unknown } } | undefined;
  if (typeof first?.delta?.content === "string") state.answer += first.delta.content;
}

async function askPublishedSpecialist(specialist: SpecialistSelection, message: string, taskId: string, repair: boolean) {
  const qualityInstruction = "Answer completely but concisely in Markdown for your assigned support domain. Use a short heading and bullets or numbered steps when useful. Every bullet must be a complete, self-contained sentence that names its subject; never begin with a dangling transition or pronoun whose referent is missing. Begin directly with the cited facts or steps: do not add an uncited introduction, transition, or conclusion. Headings may be uncited, but every factual sentence or bullet must end with its matching [#n] citation. Use only facts directly stated in the returned Netflix knowledge sources. Do not add uncited factual clauses or external links. If the sources do not support an answer, say only: I do not have enough source evidence.";
  const repairInstruction = repair
    ? " This is the one repair attempt. Rewrite the whole answer from scratch so it directly answers the assigned question with complete standalone sentences and preserves valid Markdown structure."
    : "";
  const response = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://ai-systems-today.github.io",
      "x-trace-id": taskId,
    },
    body: JSON.stringify({
      widgetId: specialist.widgetId,
      message: `${message}\n\n${qualityInstruction}${repairInstruction}`,
      sessionToken: `a2a-${taskId}`,
      deviceId: `a2a-${taskId}`,
      mode: "chat",
    }),
  });
  if (!response.ok || !response.body) throw new Error(`Published specialist returned HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = { answer: "", citations: [] as unknown[] };
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.startsWith("data:")) applySsePayload(state, line.slice(5).trim());
    if (done) break;
  }
  if (buffer.startsWith("data:")) applySsePayload(state, buffer.slice(5).trim());
  if (!state.answer.trim()) throw new Error("Published specialist returned no answer");
  if (/^I do not have enough source evidence[.!]?$/i.test(state.answer.trim())) {
    throw new Error(`Published ${specialist.domain} specialist returned no sourced answer`);
  }
  if (!state.citations.length) throw new Error(`Published ${specialist.domain} specialist returned no citations`);
  return { ...normalizeCitationBundle(state.answer.trim(), state.citations), specialist };
}

async function qualityCitations(values: unknown[]): Promise<QualityCitation[]> {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const ids = values.map((value) => {
    const citation = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    return typeof citation.chunk_id === "string" && /^[0-9a-f-]{36}$/i.test(citation.chunk_id) ? citation.chunk_id : null;
  }).filter((value): value is string => value !== null);
  const content = new Map<string, string>();
  if (serviceRoleKey && ids.length) {
    try {
      const response = await fetch(`https://oiotkbbwriecdvtnufee.supabase.co/rest/v1/document_chunks?id=in.(${ids.join(",")})&select=id,content`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (response.ok) {
        const rows = await response.json() as Array<{ id?: unknown; content?: unknown }>;
        for (const row of rows) if (typeof row.id === "string" && typeof row.content === "string") content.set(row.id, row.content);
      }
    } catch {
      // Fall back to the returned citation evidence; unsupported content is still removed.
    }
  }
  return values.map((value, index) => {
    const citation = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    const chunkId = typeof citation.chunk_id === "string" ? citation.chunk_id : null;
    const label = [citation.title, citation.source, citation.filename].find((candidate) => typeof candidate === "string");
    return {
      label: typeof label === "string" ? label : `Source ${index + 1}`,
      url: typeof citation.url === "string" ? citation.url : typeof citation.source_url === "string" ? citation.source_url : null,
      snippet: chunkId && content.has(chunkId) ? content.get(chunkId)! : citationEvidenceText(value),
    };
  });
}

const domainTerms: Record<SpecialistSelection["domain"], RegExp> = {
  billing: /\b(billing|payment|currency|charge|membership)\b/i,
  household: /\b(household|home internet|main place|tv)\b/i,
  identity: /\b(email|password|sign[ -]?in|phone|account access|reset)\b/i,
  general: /\b(netflix|support|account)\b/i,
};

async function verifySpecialistResult(result: Awaited<ReturnType<typeof askPublishedSpecialist>>, question: string) {
  const citations = await qualityCitations(result.citations);
  const answer = result.answer.trim();
  const quality = evaluateLiveAnswer({ question, answer, citations });
  return answer && domainTerms[result.specialist.domain].test(answer) && quality.status === "passed"
    ? { ...result, answer }
    : null;
}

function shiftCitationReferences(answer: string, offset: number) {
  return answer.replace(/\[#(\d+)\]/g, (_match: string, value: string) => `[#${Number(value) + offset}]`);
}

async function askSpecialistTask(message: string, taskId: string) {
  const specialists = selectSpecialists(message);
  const multiDomain = specialists.length > 1;
  const results = await Promise.all(specialists.map(async (specialist, index) => {
    const question = specialistTaskMessage(specialist, message, multiDomain);
    const specialistTaskId = `${taskId}-${index + 1}`;
    let first: Awaited<ReturnType<typeof askPublishedSpecialist>> | null = null;
    try {
      first = await askPublishedSpecialist(specialist, question, specialistTaskId, false);
    } catch {
      first = null;
    }
    const firstVerified = first ? await verifySpecialistResult(first, question) : null;
    if (firstVerified) return firstVerified;
    const repaired = await askPublishedSpecialist(specialist, question, `${specialistTaskId}-retry`, true);
    const repairedVerified = await verifySpecialistResult(repaired, question);
    if (repairedVerified) return repairedVerified;
    throw new Error(`Published ${specialist.domain} specialist failed the exact-run quality gate after one repair attempt`);
  }));
  let offset = 0;
  const answers: string[] = [];
  const citations: unknown[] = [];
  for (const result of results) {
    answers.push(shiftCitationReferences(result.answer, offset));
    citations.push(...result.citations);
    offset += result.citations.length;
  }
  return {
    answer: answers.join("\n\n"),
    citations,
    specialists: results.map(({ specialist }) => specialist),
  };
}

Deno.serve(async (req: Request) => {
  const path = new URL(req.url).pathname;
  if (req.method === "GET" && path.endsWith("/.well-known/agent-card.json")) {
    return json({
      name: "Persora Netflix Specialist Team",
      description: "Routes billing, household/travel, and account-access questions to distinct published Persora agents.",
      url: AGENT_URL,
      version: A2A_VERSION,
      protocolVersion: A2A_VERSION,
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
      skills: [
        { id: "netflix-billing", name: "Netflix billing", description: "Grounded billing-policy support.", tags: ["netflix", "billing", "rag"] },
        { id: "netflix-household", name: "Netflix household and travel", description: "Grounded household and travel support.", tags: ["netflix", "household", "travel", "rag"] },
        { id: "netflix-identity", name: "Netflix account access and security", description: "Grounded account-access and security support.", tags: ["netflix", "identity", "security", "rag"] },
      ],
    });
  }

  if (req.method !== "POST" || !path.endsWith("/message:send")) {
    return json({ error: { code: "method_not_found", message: "Use GET /.well-known/agent-card.json or POST /message:send" } }, 404);
  }
  if (req.headers.get("A2A-Version") !== A2A_VERSION) {
    return json({ error: { code: "version_not_supported", message: `A2A-Version ${A2A_VERSION} is required` } }, 400);
  }

  try {
    const body = await req.json() as { message?: { messageId?: unknown; parts?: Array<{ text?: unknown }> } };
    const text = body.message?.parts?.map((part) => typeof part.text === "string" ? part.text : "").filter(Boolean).join("\n").trim() ?? "";
    if (!text || text.length > 2000) return json({ error: { code: "invalid_message", message: "A text message of 1-2000 characters is required" } }, 400);
    const taskId = crypto.randomUUID();
    const result = await askSpecialistTask(text, taskId);
    return json({
      task: {
        id: taskId,
        contextId: typeof body.message?.messageId === "string" ? body.message.messageId : taskId,
        status: { state: "TASK_STATE_COMPLETED", timestamp: new Date().toISOString() },
        artifacts: [{
          artifactId: crypto.randomUUID(),
          name: "grounded-support-result",
          parts: [{ text: result.answer }],
          metadata: { citations: result.citations, specialists: result.specialists },
        }],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "A2A specialist failed";
    console.error(JSON.stringify({ function: "netflix-specialist-a2a", error: message }));
    return json({ error: { code: "internal_error", message } }, 500);
  }
});
