export type QualityCitation = {
  label: string;
  url: string | null;
  snippet: string | null;
};

export type LiveQuality = {
  executed: boolean;
  method: "deterministic-grounding-v3";
  status: "passed" | "failed" | "not-evaluated";
  grounding: number | null;
  citationValidity: number | null;
  answerRelevance: number | null;
  intentCoverage: number | null;
  correctness: null;
  claimCount: number;
  supportedClaimCount: number;
  referencedCitationCount: number;
  validCitationCount: number;
  requiredIntentCount: number;
  coveredIntentCount: number;
  retryCount: number;
  reason: string;
};

const STOP_WORDS = new Set([
  "a", "about", "after", "all", "also", "an", "and", "are", "as", "at", "be", "because", "been",
  "before", "but", "by", "can", "could", "do", "does", "for", "from", "get", "had", "has", "have",
  "how", "i", "if", "in", "into", "is", "it", "its", "may", "me", "my", "of", "on", "or", "our",
  "please", "should", "so", "that", "the", "their", "then", "there", "they", "this", "to", "use", "was",
  "we", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you", "your",
]);
const SUPPORT_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "account", "help", "information", "issue", "issues", "netflix", "problem", "problems", "support",
  "customer", "customers", "different", "each", "first", "must", "one", "same", "update", "updated", "using",
]);

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const round = (value: number) => Math.round(clamp(value) * 1000) / 1000;
const normalizeToken = (token: string) => {
  if (/^travell?ing$/.test(token)) return "travel";
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
};

const tokenize = (value: string, stopWords: Set<string>) => new Set(
  value.toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[#\d+\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .map(normalizeToken),
);
const tokens = (value: string) => tokenize(value, STOP_WORDS);
const supportTokens = (value: string) => tokenize(value, SUPPORT_STOP_WORDS);

const overlap = (left: Set<string>, right: Set<string>) => {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared;
};

const citationReferences = (value: string) => Array.from(
  value.matchAll(/\[#(\d+)\]/g),
  (match) => Number(match[1]),
);

const claimSegments = (answer: string) => answer
  .split(/(?<=[.!?])\s+|\n+/)
  .map((claim) => claim.trim())
  .filter((claim) => tokens(claim).size >= 3);

const citationSupport = (claim: string, citation: QualityCitation) => {
  const claimTokens = supportTokens(claim);
  const sourceTokens = supportTokens(`${citation.label} ${citation.snippet ?? ""}`);
  const shared = overlap(claimTokens, sourceTokens);
  return {
    shared,
    ratio: shared / Math.max(Math.min(claimTokens.size, 8), 1),
    supported: shared >= Math.min(3, claimTokens.size) && shared / Math.max(Math.min(claimTokens.size, 8), 1) >= 0.375,
  };
};

const appendReference = (claim: string, reference: number) => {
  const cleaned = claim
    .replace(/\s*\[#\d+\]\s*/g, " ")
    .replace(/\s+([.!?])/g, "$1")
    .trim();
  return /[.!?]$/.test(cleaned)
    ? `${cleaned.slice(0, -1).trim()} [#${reference}]${cleaned.slice(-1)}`
    : `${cleaned} [#${reference}].`;
};

/**
 * Keeps only cited, lexically supported factual sentences and anchors each one
 * to the strongest returned source (at least 3 shared substantive terms and
 * 37.5% overlap across the first 8 terms). The model's source wins exact ties.
 */
export function extractGroundedClaims(answer: string, citations: QualityCitation[]): string {
  const grounded: string[] = [];
  for (const claim of claimSegments(answer)) {
    const validReferences = [...new Set(citationReferences(claim))]
      .filter((reference) => reference >= 1 && reference <= citations.length);
    if (!validReferences.length) continue;

    const bestSupported = citations
      .map((citation, index) => ({ reference: index + 1, ...citationSupport(claim, citation) }))
      .filter((candidate) => candidate.supported)
      .sort((left, right) =>
        right.shared - left.shared ||
        right.ratio - left.ratio ||
        Number(validReferences.includes(right.reference)) - Number(validReferences.includes(left.reference))
      )[0];
    if (bestSupported) grounded.push(appendReference(claim, bestSupported.reference));
  }
  return grounded.join(" ");
}

export const notEvaluatedQuality = (reason: string): LiveQuality => ({
  executed: false,
  method: "deterministic-grounding-v3",
  status: "not-evaluated",
  grounding: null,
  citationValidity: null,
  answerRelevance: null,
  intentCoverage: null,
  correctness: null,
  claimCount: 0,
  supportedClaimCount: 0,
  referencedCitationCount: 0,
  validCitationCount: 0,
  requiredIntentCount: 0,
  coveredIntentCount: 0,
  retryCount: 0,
  reason,
});

export function evaluateLiveAnswer(input: {
  question: string;
  answer: string;
  citations: QualityCitation[];
  retryCount?: number;
  requiredTopics?: Array<{ label: string; terms: string[] }>;
}): LiveQuality {
  const questionTokens = tokens(input.question);
  const answerTokens = tokens(input.answer);
  const answerRelevance = round(overlap(questionTokens, answerTokens) / Math.max(questionTokens.size, 1));
  const uniqueReferences = [...new Set(citationReferences(input.answer))];
  const validReferences = uniqueReferences.filter((reference) => reference >= 1 && reference <= input.citations.length);
  const citationValidity = round(validReferences.length / Math.max(uniqueReferences.length, 1));
  const claims = claimSegments(input.answer);
  const requiredTopics = input.requiredTopics ?? [];
  const coveredIntentCount = requiredTopics.filter((topic) =>
    topic.terms.some((term) => overlap(answerTokens, tokens(term)) > 0)
  ).length;
  const intentCoverage = requiredTopics.length
    ? round(coveredIntentCount / requiredTopics.length)
    : null;

  let supportedClaimCount = 0;
  for (const claim of claims) {
    const references = [...new Set(citationReferences(claim))]
      .filter((reference) => reference >= 1 && reference <= input.citations.length);
    const supported = references.some((reference) => {
      return citationSupport(claim, input.citations[reference - 1]).supported;
    });
    if (supported) supportedClaimCount += 1;
  }

  const grounding = round(supportedClaimCount / Math.max(claims.length, 1));
  const passed = input.answer.trim().length > 0 && input.citations.length > 0 &&
    uniqueReferences.length > 0 && citationValidity === 1 && grounding === 1 && answerRelevance >= 0.2 &&
    (intentCoverage === null || intentCoverage === 1);
  const reason = passed
    ? "Every substantive claim links to an existing source number, shares substantive terms with that source text, and the answer addresses the question."
    : input.citations.length === 0
      ? "No source records were returned for the answer."
      : uniqueReferences.length === 0
        ? "The answer did not link its claims to returned sources with [#n] references."
        : citationValidity < 1
          ? "One or more [#n] references do not exist in the returned source list."
          : grounding < 1
            ? "One or more substantive claims lacked a citation or enough lexical support in the referenced source text."
            : intentCoverage !== null && intentCoverage < 1
              ? `The answer covered ${coveredIntentCount} of ${requiredTopics.length} required request intents.`
              : "The answer did not contain enough of the question's substantive terms."

  return {
    executed: true,
    method: "deterministic-grounding-v3",
    status: passed ? "passed" : "failed",
    grounding,
    citationValidity,
    answerRelevance,
    intentCoverage,
    correctness: null,
    claimCount: claims.length,
    supportedClaimCount,
    referencedCitationCount: uniqueReferences.length,
    validCitationCount: validReferences.length,
    requiredIntentCount: requiredTopics.length,
    coveredIntentCount,
    retryCount: input.retryCount ?? 0,
    reason,
  };
}
