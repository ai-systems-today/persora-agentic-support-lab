// Shared by the Edge Function, benchmark runner and Persora results view.
export type MetricStatus = "evaluated" | "not-evaluated" | "not-applicable" | "pending" | "error";
export type Metric = { name: string; value: number | null; unit: "ratio" | "ms" | "count" | "USD"; status: MetricStatus; method: string; reason: string };
export type EvidenceSnapshot = {
  schemaVersion: "1.0"; runId: string; question: string; draftAnswer: string; finalAnswer: string;
  contexts: Array<{ id: string | null; rank: number; label: string; url: string | null; text: string }>;
  contextOrigin: "returned-citations" | "hydrated-citations" | "generator-passages";
  generatorContextCaptured: boolean;
  retrievalRequest: { query: string; filters: Record<string, string>; topK: number | null; scopeValid?: boolean | null } | null;
  versions: { application: string | null; backend: string | null; prompt: string; corpus: string | null; evaluator: string };
  decision: { action: "deliver" | "repair" | "qualify" | "fallback" | "policy-response"; reason: string };
  repair?: { attempted: boolean; outcome: string; sourceCount?: number; generationMs?: number; evaluationMs?: number | null; inputTokens?: number | null; outputTokens?: number | null; verification?: { status: string; faithfulness: number | null; responseRelevancy: number | null; unsupportedClaims: string[]; referencedCitations: number; validCitations: number } };
};
export type BenchmarkCase = {
  id: string; category: string; question: string;
  review: { status: "pending" | "approved"; reviewer: string | null; reviewedAt: string | null; kind?: "ai-source" | "ai-policy" | "human" };
  sources: Array<{ url: string; conditions: string; snapshot?: string; hash?: string }>;
  reference: string | null; requiredFacts: string[];
  expected: { guardrail?: "allow" | "block"; handoff?: string; prohibitedEvents?: string[]; requiredEvents?: string[] };
  retrievalLabels?: Record<string, number>;
  requiredFilters?: Record<string, string>;
};
export type CaseResult = {
  caseId: string; question: string; category: string; runId: string;
  status: "passed" | "failed" | "not-evaluated"; answer: string; metrics: Metric[];
  failures: string[]; evidence: EvidenceSnapshot | null;
  sources: Array<{ label: string; url: string | null; text: string }>;
  expectedFacts: string[]; reviewStatus: string; reviewKind?: string; reviewer?: string | null; langfuseExported: boolean;
  blocked?: boolean; startedAt?: string; finishedAt?: string;
};
export type BenchmarkReport = {
  schemaVersion: "1.0"; runId: string; createdAt: string; datasetVersion: string;
  sourceVersion: string; applicationVersion: string; evaluatorVersion: string;
  scope: "fresh-application" | "contract-fixture"; status: "running" | "passed" | "failed" | "not-evaluated";
  cases: CaseResult[]; comparisonWarnings: string[]; gateFailures?: string[];
};

export const metric = (name: string, value: number | null, unit: Metric["unit"], method: string, reason: string, status?: MetricStatus): Metric => {
  if (value !== null && (!Number.isFinite(value) || value < 0 || (unit === "ratio" && value > 1))) {
    return { name, value: null, unit, method, reason: "Invalid metric value rejected", status: "error" };
  }
  return { name, value, unit, method, reason, status: status ?? (value === null ? "not-evaluated" : "evaluated") };
};

export function labelledRetrieval(ids: string[], labels: Record<string, number> | undefined, k: number): Metric[] {
  const method = "reviewed-document-labels-v1";
  if (!labels || !Object.values(labels).some(value => value > 0)) return ["precision_at_k", "recall_at_k", "ndcg_at_k"].map(name => metric(name, null, "ratio", method, "Reviewed relevant document labels unavailable"));
  const ranked = [...new Set(ids)].slice(0, k);
  const hits = ranked.filter(id => (labels[id] ?? 0) > 0).length;
  const relevant = Object.values(labels).filter(value => value > 0).length;
  const dcg = (values: number[]) => values.reduce((sum, value, index) => sum + (2 ** value - 1) / Math.log2(index + 2), 0);
  const ideal = dcg(Object.values(labels).filter(v => v > 0).sort((a, b) => b - a).slice(0, k));
  return [
    metric("precision_at_k", ranked.length ? hits / ranked.length : 0, "ratio", method, `${hits}/${ranked.length} relevant unique results; k=${k}`),
    metric("recall_at_k", hits / relevant, "ratio", method, `${hits}/${relevant} known relevant documents; limited to reviewed label pool`),
    metric("ndcg_at_k", ideal ? dcg(ranked.map(id => labels[id] ?? 0)) / ideal : 0, "ratio", method, `Graded relevance; k=${k}`),
  ];
}

export function latencySummary(values: Array<number | null>) {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const count = valid.length;
  const median = count ? (valid[Math.floor((count - 1) / 2)] + valid[Math.ceil((count - 1) / 2)]) / 2 : null;
  return { count, median, p95: count >= 20 ? valid[Math.ceil(count * .95) - 1] : null, reason: count < 20 ? "At least 20 measured samples required for this report's p95 display" : "Nearest-rank empirical p95; sample count displayed" };
}

export function comparisonWarnings(a: BenchmarkReport, b: BenchmarkReport): string[] {
  return ["datasetVersion", "sourceVersion", "evaluatorVersion", "scope"].flatMap(key => a[key as keyof BenchmarkReport] === b[key as keyof BenchmarkReport] ? [] : [`${key} differs; comparison is not controlled`]);
}

export function decideAnswer(input: { knowledgeAnswer: boolean; judgeStatus: string; invalidCitations: boolean; unsupportedCount: number; generatorEvidenceCaptured?: boolean }) {
  if (!input.knowledgeAnswer) return { action: "policy-response" as const, reason: "Non-knowledge route; existing authorization/approval/contact policy applies" };
  if (input.invalidCitations || input.unsupportedCount > 0) return { action: "fallback" as const, reason: "Invalid citations or unsupported claims; draft withheld" };
  if (input.judgeStatus === "failed") return { action: "fallback" as const, reason: "Semantic verification failed; draft withheld even when no individual unsupported claim was returned" };
  if (input.generatorEvidenceCaptured === false) return { action: "qualify" as const, reason: "Exact generator retrieval context is unavailable; measurement remains diagnostic" };
  if (input.judgeStatus !== "passed") return { action: "qualify" as const, reason: "Semantic evaluation failed or is unavailable; answer cannot be delivered as verified" };
  return { action: "deliver" as const, reason: "Applicable semantic evaluation passed; lexical checks remain diagnostics" };
}
