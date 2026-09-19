import { describe, expect, it } from "vitest";
import { evaluateLiveAnswer, extractGroundedClaims, extractGroundedMarkdown, notEvaluatedQuality, sourceFallbackMarkdown, stabilizeGroundedMarkdown } from "../supabase/functions/_shared/answerQuality";

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
    expect(quality.answerRelevance).toBeGreaterThanOrEqual(0.5);
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

  it("rejects an unsupported clause joined to a supported cited clause", () => {
    const quality = evaluateLiveAnswer({
      question: "How does Netflix determine my Household?",
      answer: "Netflix uses IP addresses, device IDs, and account activity, but does not collect GPS data to determine location [#1].",
      citations: [{
        label: "Netflix Privacy Statement",
        url: "https://help.netflix.com/en/node/100637",
        snippet: "We use IP addresses, device IDs, and account activity to determine whether a device is part of your Netflix Household.",
      }],
    });
    expect(quality.claimCount).toBe(2);
    expect(quality.supportedClaimCount).toBe(1);
    expect(quality.grounding).toBe(0.5);
    expect(quality.status).toBe("failed");
  });

  it("rejects a standalone GPS denial when the cited source only lists other signals", () => {
    const quality = evaluateLiveAnswer({
      question: "Does Netflix use GPS to decide my Household?",
      answer: "Netflix does not use GPS data to determine which devices belong to your Netflix Household [#1].",
      citations: [{
        label: "How Netflix determines a Household",
        url: null,
        snippet: "Netflix uses IP addresses, device IDs, and account activity to determine whether a device is part of a Netflix Household.",
      }],
    });
    expect(quality).toMatchObject({ status: "failed", grounding: 0, supportedClaimCount: 0 });
  });

  it("validates structured Markdown without flattening the displayed answer", () => {
    const answer = [
      "## Household help",
      "- Update your Netflix Household from a TV connected to your home internet [#1].",
    ].join("\n");
    const quality = evaluateLiveAnswer({
      question: "How do I update my Netflix Household from my TV?",
      answer,
      citations,
    });
    expect(quality.status).toBe("passed");
    expect(answer).toContain("## Household help");
    expect(answer).toContain("- Update");
  });

  it("does not misclassify Markdown headings and structural lead-ins as factual claims", () => {
    const answer = [
      "## Streaming while travelling",
      "Possible reasons:",
      "- Use Netflix while travelling on mobile devices and computers [#1].",
    ].join("\n");
    const quality = evaluateLiveAnswer({
      question: "Can I use Netflix while travelling?",
      answer,
      citations: [{
        label: "Using Netflix outside your home",
        url: null,
        snippet: "Use Netflix while traveling on mobile devices and computers.",
      }],
    });
    expect(quality).toMatchObject({ status: "passed", claimCount: 1, supportedClaimCount: 1 });
  });

  it("rejects a cited answer that mentions too little of the actual question", () => {
    const quality = evaluateLiveAnswer({
      question: "I am travelling and Netflix says this TV is not part of my household. What should I do?",
      answer: [
        "## Steps to access Netflix while travelling",
        "- This is typically done from a TV connected to your home internet [#1].",
        "- Available shows can differ by country [#2].",
      ].join("\n"),
      citations: [
        { label: "Netflix Household", url: null, snippet: "Update a Netflix Household from a TV connected to the home internet." },
        { label: "Using Netflix outside your home", url: null, snippet: "Available shows can differ by country while travelling." },
      ],
    });
    expect(quality.answerRelevance).toBeLessThan(0.5);
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

  it("fails a grounded mixed answer when it covers only one required intent", () => {
    const quality = evaluateLiveAnswer({
      question: "My billing country, household TV and sign-in email are wrong",
      answer: "Change your billing country by starting a new membership [#1].",
      citations: [{
        label: "Moving with Netflix",
        url: null,
        snippet: "To change the billing country, cancel and start a new membership in the new country.",
      }],
      requiredTopics: [
        { label: "billing", terms: ["billing", "currency"] },
        { label: "household", terms: ["household", "TV"] },
        { label: "identity", terms: ["email", "password", "sign in"] },
      ],
    });
    expect(quality).toMatchObject({
      status: "failed",
      intentCoverage: 0.333,
      requiredIntentCount: 3,
      coveredIntentCount: 1,
    });
    expect(quality.reason).toContain("Missing: household, identity");
  });

  it("can extract cited diagnostic claims without changing the displayed answer", () => {
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

  it("can build a diagnostic grounded Markdown candidate", () => {
    const answer = [
      "## Household help",
      "- Update your Netflix Household from a TV connected to your home internet [#1].",
      "- Netflix will mail a replacement television tomorrow [#1].",
    ].join("\n");
    expect(extractGroundedMarkdown(answer, citations)).toBe([
      "## Household help",
      "- Update your Netflix Household from a TV connected to your home internet [#1].",
    ].join("\n"));
  });

  it("repairs a wrong citation number while preserving Markdown structure", () => {
    const returned = [
      { label: "Identity checks", url: null, snippet: "Confirm important account changes with a security code." },
      { label: "Account recovery", url: null, snippet: "Recover a Netflix account without the registered email by providing billing information online." },
    ];
    expect(extractGroundedMarkdown(
      "## Account recovery\n\n1. Recover your Netflix account without the registered email by providing billing information online [#1].",
      returned,
    )).toBe(
      "## Account recovery\n\n1. Recover your Netflix account without the registered email by providing billing information online [#2].",
    );
  });

  it("preserves complete numbered steps when a citation applies to the whole line", () => {
    const travelCitations = [
      {
        label: "Netflix Household on a TV",
        url: null,
        snippet: "A TV outside your Netflix Household is not recognized as part of the account's main location. Sign in to Netflix on the TV with your account credentials.",
      },
      {
        label: "Using Netflix while traveling",
        url: null,
        snippet: "You can use Netflix while traveling on mobile devices and computers.",
      },
      {
        label: "Update your Netflix Household",
        url: null,
        snippet: "If you move, update your Netflix Household from a TV connected to the internet at the new location.",
      },
    ];
    const answer = [
      "## Steps to Use Netflix While Traveling",
      "",
      "1. Sign into Netflix on the TV using your account credentials. If the TV is outside your Netflix Household, it will not be recognized as part of your account's main location [#1].",
      "2. Watch Netflix on mobile devices or computers while traveling [#2].",
      "3. You never need to update your Household while traveling [#2].",
      "4. If you permanently move, update your Netflix Household from a TV connected to the internet at your new location [#3].",
      "",
      "Contact support if the issue continues.",
    ].join("\n");

    const stable = stabilizeGroundedMarkdown(answer, travelCitations);
    expect(stable).toContain("1. Sign into Netflix on the TV using your account credentials. If the TV is outside your Netflix Household");
    expect(stable).toContain("2. Watch Netflix on mobile devices or computers while traveling [#2].");
    expect(stable).toContain("4. If you permanently move");
    expect(stable).not.toContain("3. You never need");
    expect(stable).not.toContain("Contact support");
    expect(stable).not.toContain("- If the TV");
    expect(evaluateLiveAnswer({
      question: "I am traveling and this TV is outside my Netflix Household. What should I do?",
      answer: stable,
      citations: travelCitations,
    }).status).toBe("passed");
  });

  it("converges malformed aggregated Markdown before it is accepted", () => {
    const answer = [
      "## Household help",
      "- Update your Netflix Household from a TV connected to your home internet [#1]. ## Password help",
      "- Netflix will mail a replacement television tomorrow [#1].",
    ].join("\n");
    const stable = stabilizeGroundedMarkdown(answer, citations);
    expect(stable).toContain("## Household help");
    expect(stable).toContain("Update your Netflix Household");
    expect(stable).not.toContain("Password help");
    expect(evaluateLiveAnswer({
      question: "How do I update my Netflix Household from my TV?",
      answer: stable,
      citations,
    }).status).toBe("passed");
  });

  it("builds a cited fallback directly from returned source text", () => {
    const fallback = sourceFallbackMarkdown("Household specialist · verified source", citations[0]);
    expect(fallback).toContain("## Household specialist · verified source");
    expect(fallback).toContain("You can update your Netflix Household from a TV connected to your home internet [#1].");
    expect(evaluateLiveAnswer({
      question: "How do I update my Netflix Household?",
      answer: fallback,
      citations,
    }).status).toBe("passed");
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
