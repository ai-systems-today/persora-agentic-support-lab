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
