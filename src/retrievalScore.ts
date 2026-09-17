export function formatRetrievalScore(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return "score not returned";
  return `rank score ${score.toFixed(4)}`;
}
