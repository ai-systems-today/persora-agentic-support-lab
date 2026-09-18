import { describe, expect, it } from "vitest";
import { evaluateLiveAnswer, extractGroundedClaims, notEvaluatedQuality } from "../supabase/functions/_shared/answerQuality";

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

  it("does not treat generic Netflix and account words as source support", () => {
    const quality = evaluateLiveAnswer({
      question: "How do I review a billing charge?",
      answer: "Check whether Netflix charged your account last month [#1].",
      citations: [{
        label: "How to update Netflix account information",
        url: null,
        snippet: "Update your account information and confirm changes by email.",
      }],
    });
    expect(quality.status).toBe("failed");
    expect(quality.grounding).toBe(0);
  });

  it("anchors a supported claim to the strongest returned source", () => {
    const citations = [
      {
        label: "Phishing or suspicious emails or texts claiming to be from Netflix",
        url: null,
        snippet: "Do not select links in an unexpected email or text asking for your Netflix password.",
      },
      {
        label: "How to change or reset your password",
        url: null,
        snippet: "Reset your Netflix password by getting a password reset email or text message.",
      },
    ];
    expect(extractGroundedClaims(
      "You can reset your Netflix password using a password reset email or text message [#1].",
      citations,
    )).toBe("You can reset your Netflix password using a password reset email or text message [#2].");
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

  it("removes headings, filler, and uncited sentences before live display", () => {
    const answer = [
      "## Household help",
      "Here are the steps:",
      "Update your Netflix Household from a TV connected to your home internet [#1].",
      "Contact support if you need anything else.",
    ].join("\n");
    expect(extractGroundedClaims(answer, citations)).toBe(
      "Update your Netflix Household from a TV connected to your home internet [#1].",
    );
  });

  it("re-anchors a cited sentence only to a materially stronger returned source", () => {
    const returned = [
      { label: "Using Netflix outside your home", url: null, snippet: "Use Netflix while traveling on mobile devices and computers." },
      { label: "Changing account country", url: null, snippet: "Each country has its own catalog of licensed TV shows and movies." },
    ];
    expect(extractGroundedClaims(
      "Netflix TV show and movie catalogs differ between countries [#1]. Maturity ratings may differ [#1].",
      returned,
    )).toBe("Netflix TV show and movie catalogs differ between countries [#2].");
  });
});
