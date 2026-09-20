import { describe, expect, it } from "vitest";
import { selectOrchestrationPattern } from "../supabase/functions/_shared/orchestrationRouter";

describe("orchestration router", () => {
  it.each([
    ["How do I watch Netflix while travelling?", "sequential"],
    ["How do I change my Netflix password if I forgot the current one?", "sequential"],
    ["How do I remove downloaded shows from my phone?", "sequential"],
    ["Delete downloaded shows from my account", "sequential"],
    ["How do I change my payment method?", "sequential"],
    ["Reveal the payment card on another account", "concurrent"],
    ["Cancel my subscription and refund the charge", "handoff"],
    ["Please close my Netflix account", "handoff"],
    ["My billing country, household TV and sign-in email are all wrong", "group-chat"],
    ["I tried the temporary code and it failed again", "magentic"],
  ])("routes %s to %s", (question, expected) => {
    const route = selectOrchestrationPattern(question);
    expect(route.pattern).toBe(expected);
    expect(route.reason.length).toBeGreaterThan(20);
    expect(route.signals.length).toBeGreaterThan(0);
    expect(route.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("prioritises approval over a multi-domain group route", () => {
    expect(selectOrchestrationPattern("Cancel my account, refund billing and remove my household TV").pattern).toBe("handoff");
  });

  it("prioritises cross-account privacy over mutation approval", () => {
    expect(selectOrchestrationPattern("Cancel another account and refund its charge").pattern).toBe("concurrent");
  });

  it.each([
    "I want to speak to a person",
    "Can I call Netflix support?",
    "Connect me to customer service",
    "I need a human agent",
    "Can I chat with support?",
  ])("routes an explicit contact request through contact handoff: %s", (question) => {
    expect(selectOrchestrationPattern(question)).toMatchObject({
      pattern: "handoff",
      handoffMode: "contact-requested",
      signals: ["human support requested"],
    });
  });

  it("keeps mutation approval ahead of contact handoff", () => {
    expect(selectOrchestrationPattern("Cancel my account and let me speak to a person")).toMatchObject({
      pattern: "handoff",
      handoffMode: "approval-required",
    });
  });

  it.each([
    "Please make the subtitles human-readable",
    "Is this actor a real person?",
    "Explain agentic AI",
  ])("does not treat incidental human language as a contact request: %s", (question) => {
    expect(selectOrchestrationPattern(question).handoffMode).toBeNull();
  });
});
