import { describe, expect, it } from "vitest";
import {
  NETFLIX_SPECIALISTS,
  selectPrimarySpecialist,
  selectSpecialists,
  specialistEvaluationQuestion,
  specialistRetrievalHint,
  specialistTaskMessage,
} from "../supabase/functions/_shared/specialistRouter";

describe("published Netflix specialist routing", () => {
  it.each([
    ["How do I review a billing charge?", "billing", "d5a728ec-1d60-48de-8f5a-2efe5ef2c035"],
    ["Why can’t I stream while travelling?", "household", "6aef9740-a5b2-4ca9-9cb3-65e74f3072d6"],
    ["How do I reset my sign-in password?", "identity", "0986654e-33b8-4e29-92db-ed56839dbeb1"],
  ])("routes %s to the %s published widget", (question, domain, widgetId) => {
    const specialist = selectPrimarySpecialist(question);
    expect(specialist.domain).toBe(domain);
    expect(specialist.widgetId).toBe(widgetId);
    expect(specialist.agentId).not.toBe(NETFLIX_SPECIALISTS.general.agentId);
  });

  it("fans a multi-domain question out to three distinct agents and widgets", () => {
    const specialists = selectSpecialists("My billing country, household TV and sign-in email are all wrong");
    expect(specialists.map(({ domain }) => domain)).toEqual(["billing", "household", "identity"]);
    expect(new Set(specialists.map(({ agentId }) => agentId)).size).toBe(3);
    expect(new Set(specialists.map(({ widgetId }) => widgetId)).size).toBe(3);
  });

  it("matches the exact mixed-domain starter wording", () => {
    const specialists = selectSpecialists("My account is billed in another country, household verification fails, and I cannot access my original email.");
    expect(specialists.map(({ domain }) => domain)).toEqual(["billing", "household", "identity"]);
  });

  it("does not misroute Household verification as a separate identity issue", () => {
    expect(selectSpecialists("My household verification fails").map(({ domain }) => domain)).toEqual(["household"]);
  });

  it("uses the existing general support agent only when no specialist domain matches", () => {
    expect(selectPrimarySpecialist("What Netflix help is available?")).toEqual(NETFLIX_SPECIALISTS.general);
  });

  it("decomposes a multi-domain request into focused specialist tasks", () => {
    const original = "My billing country, household TV and original sign-in email are all wrong";
    const tasks = selectSpecialists(original).map((specialist) => specialistTaskMessage(specialist, original, true));
    expect(tasks).toEqual([
      "My billing country",
      "household TV",
      "original sign-in email are all wrong",
    ]);
    expect(tasks[0]).toContain("My billing country");
    expect(tasks[0]).not.toContain("household TV");
    expect(tasks[1]).toContain("household TV");
    expect(tasks[1]).not.toContain("sign-in email");
    expect(tasks[2]).toContain("original sign-in email are all wrong");
    expect(tasks[2]).not.toContain("billing country");
  });

  it("preserves the original account-email problem for the identity specialist", () => {
    const original = "I cannot access my original email";
    expect(specialistTaskMessage(NETFLIX_SPECIALISTS.identity, original, true)).toContain(original);
  });

  it("scores each specialist against only its matching customer clause", () => {
    const original = "My account is billed in another country, household verification fails, and I cannot access my original email";
    const specialists = selectSpecialists(original);
    expect(specialists.map((specialist) => specialistEvaluationQuestion(specialist, original, true))).toEqual([
      "My account is billed in another country",
      "household verification fails",
      "I cannot access my original email",
    ]);
  });

  it("adds narrow source-title guidance for the three retrieval failure topics", () => {
    expect(specialistRetrievalHint("I am travelling and this TV is not part of my household"))
      .toContain("How to update a Netflix Household");
    expect(specialistRetrievalHint("My temporary travel access failed. Can I use a hotel TV?"))
      .toContain("Using Netflix outside of your home");
    expect(specialistRetrievalHint("Does Netflix use GPS for my Household?"))
      .toContain("What is a Netflix Household?");
    expect(specialistRetrievalHint("How do I review a billing charge?"))
      .toBe("");
  });
});
