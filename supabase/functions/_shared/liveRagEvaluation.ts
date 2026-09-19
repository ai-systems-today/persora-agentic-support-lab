export type LiveRagMetricName =
  | "faithfulness"
  | "responseRelevancy"
  | "contextPrecision"
  | "contextRecall"
  | "factualCorrectness";

export type LiveRagEvaluation = {
  executed: boolean;
  scope: "request" | null;
  implementation: "azure-openai-ragas-compatible-v1";
  evaluatorModel: string | null;
  evaluatorVersion: "2026-09-19.9";
  status: "passed" | "failed" | "not-evaluated";
  referenceId: string | null;
  metrics: Record<LiveRagMetricName, number | null>;
  reasons: Partial<Record<LiveRagMetricName, string>>;
  unsupportedClaims: string[];
  relevantContextIndices: number[];
  inputHashes: { question: string; answer: string; contexts: string } | null;
  durationMs: number | null;
  error: string | null;
};

export type LiveRagReference = {
  id: string;
  answer: string;
  requiredTopics: Array<{ label: string; terms: string[] }>;
};

const LIVE_REFERENCES = new Map<string, LiveRagReference>([
  [
    "i am travelling and netflix says this tv is not part of my household. what should i do?",
    {
      id: "grounded-answer@2026-09-19",
      answer: "Use Netflix's travelling or temporary-access path for a TV away from home, verify through the account contact method, and update the Netflix Household from the primary home TV when required.",
      requiredTopics: [
        { label: "temporary travel access", terms: ["temporary"] },
        { label: "verification", terms: ["verify", "verification"] },
        { label: "Household update", terms: ["update"] },
      ],
    },
  ],
  [
    "my account is billed in another country, household verification fails, and i cannot access my original email. what should i do?",
    {
      id: "group-chat@2026-09-19",
      answer: "Handle the request as three bounded issues: follow Netflix's country-change membership process for billing, update the Household from a TV on the home internet, and use authenticated password or account-recovery support for lost email access.",
      requiredTopics: [
        { label: "billing country", terms: ["billing", "currency", "country"] },
        { label: "Household", terms: ["household", "home internet"] },
        { label: "email access", terms: ["email", "account recovery"] },
      ],
    },
  ],
  [
    "my temporary netflix travel access failed. can i use netflix on a mobile device, computer, or hotel tv instead?",
    {
      id: "recovery@2026-09-19",
      answer: "Netflix can be used while travelling on mobile devices and computers, and users can sign in on a hotel or holiday-rental TV; availability can vary by country.",
      requiredTopics: [
        { label: "mobile device", terms: ["mobile", "phone", "tablet"] },
        { label: "computer", terms: ["computer", "laptop"] },
        { label: "hotel TV", terms: ["hotel", "holiday rental"] },
      ],
    },
  ],
]);

const emptyMetrics = (): LiveRagEvaluation["metrics"] => ({
  faithfulness: null,
  responseRelevancy: null,
  contextPrecision: null,
  contextRecall: null,
  factualCorrectness: null,
});

const clampMetric = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
};

const normalizeQuestion = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export const referenceForQuestion = (question: string): LiveRagReference | null =>
  LIVE_REFERENCES.get(normalizeQuestion(question)) ?? null;

const sha256 = async (value: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
).map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const notEvaluatedLiveRag = (reason: string): LiveRagEvaluation => ({
  executed: false,
  scope: null,
  implementation: "azure-openai-ragas-compatible-v1",
  evaluatorModel: null,
  evaluatorVersion: "2026-09-19.9",
  status: "not-evaluated",
  referenceId: null,
  metrics: emptyMetrics(),
  reasons: {},
  unsupportedClaims: [],
  relevantContextIndices: [],
  inputHashes: null,
  durationMs: null,
  error: reason,
});

export async function evaluateExactRun(input: {
  question: string;
  answer: string;
  contexts: string[];
  reference?: LiveRagReference | null;
  endpoint: string;
  apiKey: string;
  model?: string;
  fetcher?: typeof fetch;
}): Promise<LiveRagEvaluation> {
  const started = performance.now();
  const model = input.model ?? "gpt-4o-mini";
  const reference = input.reference ?? null;
  const contexts = input.contexts.map((context) => context.trim()).filter(Boolean).slice(0, 32);
  const inputHashes = {
    question: await sha256(input.question),
    answer: await sha256(input.answer),
    contexts: await sha256(JSON.stringify(contexts)),
  };
  if (!input.answer.trim() || !contexts.length) {
    return {
      ...notEvaluatedLiveRag("A generated answer and retrieved context are both required."),
      inputHashes,
      durationMs: Math.round(performance.now() - started),
    };
  }

  const systemPrompt = `You are a strict evaluator for a retrieval-augmented customer-support answer.
Use only the supplied question, answer, contexts, and optional trusted reference.
Do not reward confident wording. If any factual clause is not entailed by the contexts, list it as unsupported.
Return one JSON object with this exact shape:
{
  "faithfulness": 0.0,
  "responseRelevancy": 0.0,
  "contextPrecision": 0.0,
  "contextRecall": null,
  "factualCorrectness": null,
  "reasons": {
    "faithfulness": "...",
    "responseRelevancy": "...",
    "contextPrecision": "...",
    "contextRecall": "...",
    "factualCorrectness": "..."
  },
  "unsupportedClaims": [],
  "relevantContextIndices": []
}
Metric rules:
- faithfulness: fraction of factual answer claims entailed by the contexts.
- responseRelevancy: how directly and completely the answer addresses the question.
- contextPrecision: fraction of supplied contexts useful for answering the question.
- contextRecall: fraction of trusted-reference claims covered by the contexts; null without a trusted reference.
- factualCorrectness: factual precision/recall of the answer against the trusted reference; null without a trusted reference.
All numeric scores are numbers from 0 to 1. Treat unsupported negative claims (for example, saying a source does not use GPS when the source says nothing about GPS) as unsupported.`;

  const payload = {
    question: input.question,
    answer: input.answer,
    trustedReference: reference?.answer ?? null,
    referenceMetricsRequired: Boolean(reference),
    contexts: contexts.map((context, index) => ({ index: index + 1, text: context })),
  };

  let lastError = "Exact-run evaluator failed";
  for (let evaluatorAttempt = 0; evaluatorAttempt < 2; evaluatorAttempt += 1) {
    try {
      const response = await (input.fetcher ?? fetch)(
      `${input.endpoint.replace(/\/$/, "")}/openai/deployments/${model}/chat/completions?api-version=2024-08-01-preview`,
      {
        method: "POST",
        headers: { "api-key": input.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: `${systemPrompt}${evaluatorAttempt > 0 ? "\nThis is a contract-repair attempt. Return every required metric. When referenceMetricsRequired is true, contextRecall and factualCorrectness MUST be numeric values, never null." : ""}` },
            { role: "user", content: JSON.stringify(payload) },
          ],
          temperature: 0,
          max_tokens: 1400,
          response_format: { type: "json_object" },
        }),
      },
    );
      if (!response.ok) throw new Error(`Azure evaluator returned HTTP ${response.status}`);
      const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("Azure evaluator returned no JSON content");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const parsedReasons = parsed.reasons && typeof parsed.reasons === "object"
        ? parsed.reasons as Record<string, unknown>
        : {};
      const metrics: LiveRagEvaluation["metrics"] = {
        faithfulness: clampMetric(parsed.faithfulness),
        responseRelevancy: clampMetric(parsed.responseRelevancy),
        contextPrecision: clampMetric(parsed.contextPrecision),
        contextRecall: reference ? clampMetric(parsed.contextRecall) : null,
        factualCorrectness: reference ? clampMetric(parsed.factualCorrectness) : null,
      };
      const missingMetrics = Object.entries(metrics)
        .filter(([name, value]) => value === null && (name === "faithfulness" || name === "responseRelevancy" || name === "contextPrecision" || Boolean(reference)))
        .map(([name]) => name);
      if (missingMetrics.length) {
        throw new Error(`Azure evaluator omitted required metrics: ${missingMetrics.join(", ")}`);
      }
      if (metrics.faithfulness === null || metrics.responseRelevancy === null || metrics.contextPrecision === null) {
        throw new Error("Azure evaluator omitted a required live metric");
      }
      const unsupportedClaims = Array.isArray(parsed.unsupportedClaims)
        ? parsed.unsupportedClaims.filter((value): value is string => typeof value === "string").slice(0, 20)
        : [];
      const relevantContextIndices = Array.isArray(parsed.relevantContextIndices)
        ? parsed.relevantContextIndices.filter((value): value is number => Number.isInteger(value) && value >= 1 && value <= contexts.length)
        : [];
      if (metrics.contextPrecision === 0 && relevantContextIndices.length > 0) {
        throw new Error("Azure evaluator returned zero context precision while identifying relevant contexts");
      }
      const reasons = Object.fromEntries(
        Object.entries(parsedReasons).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ) as LiveRagEvaluation["reasons"];
      const derivedContextPrecision = Math.round((relevantContextIndices.length / contexts.length) * 1000) / 1000;
      if (metrics.contextPrecision !== derivedContextPrecision) {
        reasons.contextPrecision = `${reasons.contextPrecision ?? "Relevant contexts were identified by the evaluator."} Contract normalization computed ${relevantContextIndices.length}/${contexts.length} relevant supplied contexts.`;
        metrics.contextPrecision = derivedContextPrecision;
      }
      const passed = unsupportedClaims.length === 0 && metrics.faithfulness >= 0.8 && metrics.responseRelevancy >= 0.7 &&
        (metrics.factualCorrectness === null || metrics.factualCorrectness >= 0.7);
      return {
        executed: true,
        scope: "request",
        implementation: "azure-openai-ragas-compatible-v1",
        evaluatorModel: model,
        evaluatorVersion: "2026-09-19.9",
        status: passed ? "passed" : "failed",
        referenceId: reference?.id ?? null,
        metrics,
        reasons,
        unsupportedClaims,
        relevantContextIndices,
        inputHashes,
        durationMs: Math.round(performance.now() - started),
        error: null,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Exact-run evaluator failed";
    }
  }
  return {
    ...notEvaluatedLiveRag(lastError),
    inputHashes,
    durationMs: Math.round(performance.now() - started),
  };
}
