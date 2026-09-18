import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const UPSTREAM = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/orchestrate-chat";
const AGENT_URL = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/netflix-specialist-a2a";
const DEFAULT_WIDGET = "6a01cc31-ee9e-4977-aa8c-031894a71851";
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

async function askPublishedSpecialist(message: string, taskId: string) {
  const question = /billing/i.test(message) && /household/i.test(message) && /email/i.test(message)
    ? "Give one verified step for each of these Netflix issues: billing, Netflix Household, and account email access."
    : message;
  const qualityInstruction = "Answer in at most 3 standalone sentences. Every sentence must contain exactly one factual claim and end with its matching [#n] citation. Use only facts directly stated in the returned Netflix knowledge sources. Do not include headings, introductions, transitions, uncited text, links, or follow-up questions. If the sources do not support an answer, say only: I do not have enough source evidence.";
  const response = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://ai-systems-today.github.io",
      "x-trace-id": taskId,
    },
    body: JSON.stringify({
      widgetId: DEFAULT_WIDGET,
      message: `${question}\n\n${qualityInstruction}`,
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
  return state;
}

Deno.serve(async (req: Request) => {
  const path = new URL(req.url).pathname;
  if (req.method === "GET" && path.endsWith("/.well-known/agent-card.json")) {
    return json({
      name: "Persora Netflix Support Specialist",
      description: "Grounded Netflix support specialist backed by the published Persora knowledge base.",
      url: AGENT_URL,
      version: A2A_VERSION,
      protocolVersion: A2A_VERSION,
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
      skills: [{
        id: "netflix-support-grounding",
        name: "Netflix support grounding",
        description: "Returns a support answer and source citations from the configured Netflix knowledge base.",
        tags: ["netflix", "support", "rag"],
      }],
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
    const result = await askPublishedSpecialist(text, taskId);
    return json({
      task: {
        id: taskId,
        contextId: typeof body.message?.messageId === "string" ? body.message.messageId : taskId,
        status: { state: "TASK_STATE_COMPLETED", timestamp: new Date().toISOString() },
        artifacts: [{
          artifactId: crypto.randomUUID(),
          name: "grounded-support-result",
          parts: [{ text: result.answer }],
          metadata: { citations: result.citations },
        }],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "A2A specialist failed";
    console.error(JSON.stringify({ function: "netflix-specialist-a2a", error: message }));
    return json({ error: { code: "internal_error", message } }, 500);
  }
});
