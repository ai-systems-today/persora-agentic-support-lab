import type { Citation, RuntimeEvidence } from "./types";

export const NETFLIX_WIDGET_ID = "6a01cc31-ee9e-4977-aa8c-031894a71851";
export const PERSORA_CHAT_URL = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/orchestrate-chat";

export type StreamState = {
  answer: string;
  citations: Citation[];
  eventTypes: string[];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : null;

function normaliseCitation(value: unknown, index: number): Citation {
  const record = asRecord(value) ?? {};
  const url = typeof record.url === "string"
    ? record.url
    : typeof record.source_url === "string"
      ? record.source_url
      : null;
  const label = [record.title, record.source, record.filename]
    .find((candidate) => typeof candidate === "string") as string | undefined;
  const similarity = typeof record.similarity === "number"
    ? record.similarity
    : typeof record.score === "number"
      ? record.score
      : null;
  const snippet = [record.snippet, record.content, record.text]
    .find((candidate) => typeof candidate === "string") as string | undefined;

  return {
    label: label ?? (url ? new URL(url).hostname : `Source ${index + 1}`),
    url,
    snippet: snippet ?? null,
    similarity,
  };
}

export function applySsePayload(state: StreamState, payload: string): StreamState {
  if (!payload || payload === "[DONE]") return state;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return state;
  }

  const record = asRecord(parsed);
  if (!record) return state;
  const type = typeof record.type === "string" ? record.type : "message";
  const eventTypes = state.eventTypes.includes(type) ? state.eventTypes : [...state.eventTypes, type];

  if (type === "citations" && Array.isArray(record.citations)) {
    return {
      ...state,
      eventTypes,
      citations: record.citations.map(normaliseCitation),
    };
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const choice = asRecord(choices[0]);
  const delta = asRecord(choice?.delta);
  const content = typeof delta?.content === "string" ? delta.content : "";

  return { ...state, eventTypes, answer: state.answer + content };
}

function sessionValue(key: string): string {
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  sessionStorage.setItem(key, value);
  return value;
}

export async function askPublishedAgent(question: string): Promise<{ answer: string; runtime: RuntimeEvidence }> {
  const started = performance.now();
  const traceId = crypto.randomUUID();
  const response = await fetch(PERSORA_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-trace-id": traceId,
    },
    body: JSON.stringify({
      widgetId: NETFLIX_WIDGET_ID,
      message: question,
      sessionToken: sessionValue("persora-demo-session"),
      deviceId: sessionValue("persora-demo-device"),
      mode: "chat",
    }),
  });

  if (!response.ok) {
    throw new Error(`Published agent returned HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("Published agent returned no event stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let state: StreamState = { answer: "", citations: [], eventTypes: [] };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data:")) state = applySsePayload(state, line.slice(5).trim());
    }
    if (done) break;
  }
  if (buffer.startsWith("data:")) state = applySsePayload(state, buffer.slice(5).trim());
  if (!state.answer.trim()) throw new Error("The event stream completed without answer text.");

  return {
    answer: state.answer.trim(),
    runtime: {
      mode: "live",
      transport: "sse",
      traceId,
      totalMs: Math.round(performance.now() - started),
      eventTypes: state.eventTypes,
      citations: state.citations,
      error: null,
    },
  };
}
