import { describe, expect, it } from "vitest";
import { formatRetrievalScore } from "./retrievalScore";

describe("retrieval score formatting", () => {
  it("renders the backend weighted rank score without inventing a percentage", () => {
    expect(formatRetrievalScore(1.0548315344790167)).toBe("rank score 1.0548");
  });

  it("retains the missing-score state", () => {
    expect(formatRetrievalScore(null)).toBe("score not returned");
  });
});
