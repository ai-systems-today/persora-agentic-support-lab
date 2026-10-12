export async function exportNumericScores(input: {
  baseUrl: string; publicKey: string; secretKey: string; traceId: string;
  scores: Array<{ name: string; value: number | null; reason?: string }>;
  fetcher?: typeof fetch;
}): Promise<{ status: "exported" | "partial" | "not-applicable"; exported: number; failed: number }> {
  const scores = input.scores.filter((s): s is { name: string; value: number; reason?: string } => s.value !== null && Number.isFinite(s.value));
  const results = await Promise.allSettled(scores.map(async score => {
    const response = await (input.fetcher ?? fetch)(`${input.baseUrl.replace(/\/$/, "")}/api/public/scores`, {
      method: "POST", signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Basic ${btoa(`${input.publicKey}:${input.secretKey}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: `${input.traceId}-${score.name}`, traceId: input.traceId, name: score.name, value: score.value, dataType: "NUMERIC" }),
    });
    if (!response.ok) throw new Error(`Score export HTTP ${response.status}`);
  }));
  const failed = results.filter(r => r.status === "rejected").length;
  return { status: !scores.length ? "not-applicable" : failed ? "partial" : "exported", exported: scores.length - failed, failed };
}

// SDK-compatible score-only batches avoid one API request per metric.
export async function exportNumericScoreBatch(input: Parameters<typeof exportNumericScores>[0]): Promise<{ status: "exported" | "partial" | "not-applicable"; exported: number; failed: number }> {
  const scores = input.scores.filter(s => s.value !== null && Number.isFinite(s.value));
  if (!scores.length) return { status: "not-applicable", exported: 0, failed: 0 };
  const timestamp = new Date().toISOString();
  const batch = scores.map(s => ({ id: `${input.traceId}-${s.name}`, type: "score-create", timestamp,
    body: { id: `${input.traceId}-${s.name}`, traceId: input.traceId, name: s.name, value: s.value, dataType: "NUMERIC" } }));
  try {
    const response = await (input.fetcher ?? fetch)(`${input.baseUrl.replace(/\/$/, "")}/api/public/ingestion`, {
      method: "POST", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Basic ${btoa(`${input.publicKey}:${input.secretKey}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ batch }),
    });
    if (!response.ok) throw new Error("Batch rejected");
    const result = await response.json() as { successes?: Array<{ id?: string }> };
    const accepted = new Set((result.successes ?? []).map(s => s.id));
    const exported = batch.filter(event => accepted.has(event.id)).length;
    return { status: exported === scores.length ? "exported" : "partial", exported, failed: scores.length - exported };
  } catch { return { status: "partial", exported: 0, failed: scores.length }; }
}
