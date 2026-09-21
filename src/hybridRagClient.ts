export type HybridBackend = "azure-openai" | "pinecone" | "neo4j";
export type HybridEvidence = { backend: HybridBackend; executed: boolean; durationMs: number; records: number; error: string | null };
export type HybridVectorMatch = { id: string; score: number; content: string; title: string | null; sourceUrl: string | null };
export type HybridGraphFact = { from: string; relationship: string; to: string; sourceChunkIds: string[]; sourceUrls: string[] };
export type HybridResult = {
  runId: string;
  question: string;
  vectorMatches: HybridVectorMatch[];
  graphFacts: HybridGraphFact[];
  evidence: HybridEvidence[];
  totalMs: number;
  error: string | null;
};

export const HYBRID_RAG_URL = "https://aaojmerjqlklrozkvhdl.supabase.co/functions/v1/hybrid-rag-demo";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pHV9hHkDwKJ0I3EFw3204g_yI7sI9l4";

const sessionValue = () => {
  const key = "persora-hybrid-rag-session";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  sessionStorage.setItem(key, value);
  return value;
};

export function normalizeHybridResult(value: unknown): HybridResult {
  if (!value || typeof value !== "object") throw new Error("Hybrid endpoint returned an invalid response.");
  const record = value as Partial<HybridResult> & { error?: unknown };
  if (typeof record.error === "string" && (!Array.isArray(record.evidence) || !record.evidence.length)) throw new Error(record.error);
  if (typeof record.runId !== "string" || !Array.isArray(record.vectorMatches) || !Array.isArray(record.graphFacts) || !Array.isArray(record.evidence)) {
    throw new Error("Hybrid endpoint returned an invalid evidence contract.");
  }
  return {
    runId: record.runId,
    question: typeof record.question === "string" ? record.question : "",
    vectorMatches: record.vectorMatches,
    graphFacts: record.graphFacts,
    evidence: record.evidence,
    totalMs: typeof record.totalMs === "number" ? record.totalMs : 0,
    error: typeof record.error === "string" ? record.error : null,
  };
}

export async function askHybridRag(question: string): Promise<HybridResult> {
  const response = await fetch(HYBRID_RAG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-trace-id": crypto.randomUUID(),
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ question, sessionToken: sessionValue() }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && (!payload || typeof payload !== "object" || !Array.isArray((payload as Partial<HybridResult>).evidence))) {
    throw new Error(typeof payload.error === "string" ? payload.error : `Hybrid endpoint returned HTTP ${response.status}.`);
  }
  return normalizeHybridResult(payload);
}
