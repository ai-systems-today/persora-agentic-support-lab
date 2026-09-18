import { describe, expect, it } from "vitest";
import { evaluateLiveAnswer, notEvaluatedQuality } from "../supabase/functions/_shared/answerQuality";

const citations = [{
  label: "How to update your Netflix Household",
  url: "https://help.netflix.com/en/node/128339",
  snippet: "You can update your Netflix Household from a TV connected to your home internet.",
}];

describe("exact-run answer quality", () => {
  it("passes a relevant claim with an existing, lexically supporting citation", () => {
    const quality = evaluateLiveAnswer({
      question: "How do I update my Netflix Household from my TV?",
      answer: "Update your Netflix Household from a TV connected to your home internet [#1].",
      citations,
    });
    expect(quality).toMatchObject({
      executed: true,
      status: "passed",
      grounding: 1,
      citationValidity: 1,
      retryCount: 0,
    });
    expect(quality.answerRelevance).toBeGreaterThanOrEqual(0.2);
  });

  it("fails an answer that references a source number that was not returned", () => {
    const quality = evaluateLiveAnswer({
      question: "How do I update my Netflix Household?",
      answer: "Update it from your TV [#2].",
      citations,
      retryCount: 1,
    });
    expect(quality.status).toBe("failed");
    expect(quality.citationValidity).toBe(0);
    expect(quality.retryCount).toBe(1);
  });

  it("fails instead of treating citation presence as factual support", () => {
    const quality = evaluateLiveAnswer({
      question: "How do I update my Netflix Household?",
      answer: "Netflix will mail a replacement television tomorrow [#1].",
      citations,
    });
    expect(quality.status).toBe("failed");
    expect(quality.grounding).toBe(0);
  });

  it("counts an uncited substantive sentence as unsupported", () => {
    const quality = evaluateLiveAnswer({
      question: "How do I update my Netflix Household from my TV?",
      answer: "Update your Netflix Household from a TV connected to your home internet [#1]. Netflix will also mail you a new television tomorrow.",
      citations,
    });
    expect(quality.claimCount).toBe(2);
    expect(quality.supportedClaimCount).toBe(1);
    expect(quality.grounding).toBe(0.5);
    expect(quality.status).toBe("failed");
  });

  it("keeps correctness null and non-answer routes explicitly not evaluated", () => {
    expect(notEvaluatedQuality("guardrail blocked")).toMatchObject({
      executed: false,
      status: "not-evaluated",
      correctness: null,
      reason: "guardrail blocked",
    });
  });
});
