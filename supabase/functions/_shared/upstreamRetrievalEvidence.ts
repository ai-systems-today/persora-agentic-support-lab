export type UpstreamRetrievalEvidence = {
  schemaVersion: "1.0"; requestId: string | null;
  searches: Array<{ query: string; method: string; topK: number | null; filters: Record<string, string>; durationMs: number; status: "success" | "error"; scopeValid: boolean | null }>;
  passages: Array<{ id: string | null; documentId: string | null; label: string; text: string; rank: number; citationIndex?: number }>;
  generatorContext: string; generatorContextHash: string; generatorContextCaptured: boolean;
  retrievalMs: number | null; embeddingMs: number | null; documentSearchMs: number | null;
  backendVersion: string | null; corpusVersion: string | null;
  retrievalStartedAt?: string | null; retrievalFinishedAt?: string | null;
};
export function allowServerCapture(header: string | null, key: string | undefined, requested: unknown): boolean {
  if (requested !== true || !key || !header) return false;
  const expected = `Bearer ${key}`;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
export async function parseUpstreamEvidence(value: unknown, expectedId?: string): Promise<UpstreamRetrievalEvidence | null> {
  const r = value as UpstreamRetrievalEvidence;
  if (!r || r.schemaVersion !== "1.0" || (expectedId && r.requestId !== expectedId) || !Array.isArray(r.passages) || !Array.isArray(r.searches) || typeof r.generatorContextCaptured !== "boolean" || typeof r.generatorContext !== "string" || typeof r.generatorContextHash !== "string") return null;
  if (r.passages.some(p => typeof p.text !== "string" || typeof p.label !== "string" || !Number.isInteger(p.rank) || p.rank < 1 || !r.generatorContext.includes(p.text))) return null;
  if (r.searches.some(s => typeof s.query !== "string" || typeof s.method !== "string" || !Number.isFinite(s.durationMs) || s.durationMs < 0 || (s.topK !== null && (!Number.isInteger(s.topK) || s.topK < 1)) || !s.filters || Object.values(s.filters).some(v => typeof v !== "string"))) return null;
  if (r.searches.some(s => !["success", "error"].includes(s.status) || (s.scopeValid !== null && typeof s.scopeValid !== "boolean"))) return null;
  for (const timing of [r.retrievalMs, r.embeddingMs, r.documentSearchMs]) if (timing != null && (!Number.isFinite(timing) || timing < 0)) return null;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(r.generatorContext))), b => b.toString(16).padStart(2, "0")).join("");
  return hash === r.generatorContextHash ? r : null;
}
export function retrievalWindow(captures: UpstreamRetrievalEvidence[]): number | null {
  if (captures.length === 1) return captures[0].retrievalMs;
  if (!captures.length) return null;
  const starts = captures.map(c => c.retrievalStartedAt ? Date.parse(c.retrievalStartedAt) : NaN);
  const ends = captures.map(c => c.retrievalFinishedAt ? Date.parse(c.retrievalFinishedAt) : NaN);
  if (![...starts, ...ends].every(Number.isFinite)) return null;
  const value = Math.max(...ends) - Math.min(...starts);
  return value >= 0 ? value : null;
}
