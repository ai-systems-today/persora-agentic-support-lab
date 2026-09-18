export type QualityCitation = {
  label: string;
  url: string | null;
  snippet: string | null;
};

export type LiveQuality = {
  executed: boolean;
  method: "deterministic-grounding-v1";
  status: "passed" | "failed" | "not-evaluated";
  grounding: number | null;
  citationValidity: number | null;
  answerRelevance: number | null;
  correctness: null;
  claimCount: number;
  supportedClaimCount: number;
  referencedCitationCount: number;
  validCitationCount: number;
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

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const round = (value: number) => Math.round(clamp(value) * 1000) / 1000;

const tokens = (value: string) => new Set(
  value.toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[#\d+\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
);

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

export const notEvaluatedQuality = (reason: string): LiveQuality => ({
  executed: false,
  method: "deterministic-grounding-v1",
  status: "not-evaluated",
  grounding: null,
  citationValidity: null,
  answerRelevance: null,
  correctness: null,
  claimCount: 0,
  supportedClaimCount: 0,
  referencedCitationCount: 0,
  validCitationCount: 0,
  retryCount: 0,
  reason,
});

export function evaluateLiveAnswer(input: {
  question: string;
  answer: string;
  citations: QualityCitation[];
  retryCount?: number;
}): LiveQuality {
  const questionTokens = tokens(input.question);
  const answerTokens = tokens(input.answer);
  const answerRelevance = round(overlap(questionTokens, answerTokens) / Math.max(questionTokens.size, 1));
  const uniqueReferences = [...new Set(citationReferences(input.answer))];
  const validReferences = uniqueReferences.filter((reference) => reference >= 1 && reference <= input.citations.length);
  const citationValidity = round(validReferences.length / Math.max(uniqueReferences.length, 1));
  const claims = input.answer
    .split(/(?<=[.!?])\s+|\n+/)
    .map((claim) => claim.trim())
    .filter((claim) => tokens(claim).size >= 3);

  let supportedClaimCount = 0;
  for (const claim of claims) {
    const claimTokens = tokens(claim);
    const references = [...new Set(citationReferences(claim))]
      .filter((reference) => reference >= 1 && reference <= input.citations.length);
    const supported = references.some((reference) => {
      const citation = input.citations[reference - 1];
      const sourceTokens = tokens(`${citation.label} ${citation.snippet ?? ""}`);
      const shared = overlap(claimTokens, sourceTokens);
      return shared >= Math.min(2, claimTokens.size) && shared / Math.max(Math.min(claimTokens.size, 8), 1) >= 0.16;
    });
    if (supported) supportedClaimCount += 1;
  }

  const grounding = round(supportedClaimCount / Math.max(claims.length, 1));
  const passed = input.answer.trim().length > 0 && input.citations.length > 0 &&
    uniqueReferences.length > 0 && citationValidity === 1 && grounding === 1 && answerRelevance >= 0.2;
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
            : "The answer did not contain enough of the question's substantive terms."

  return {
    executed: true,
    method: "deterministic-grounding-v1",
    status: passed ? "passed" : "failed",
    grounding,
    citationValidity,
    answerRelevance,
    correctness: null,
    claimCount: claims.length,
    supportedClaimCount,
    referencedCitationCount: uniqueReferences.length,
    validCitationCount: validReferences.length,
    retryCount: input.retryCount ?? 0,
    reason,
  };
}
