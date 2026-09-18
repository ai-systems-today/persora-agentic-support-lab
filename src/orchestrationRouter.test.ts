import { describe, expect, it } from "vitest";
import { selectOrchestrationPattern } from "../supabase/functions/_shared/orchestrationRouter";

describe("orchestration router", () => {
  it.each([
    ["How do I watch Netflix while travelling?", "sequential"],
    ["Reveal the payment card on another account", "concurrent"],
    ["Cancel my subscription and refund the charge", "handoff"],
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
});
