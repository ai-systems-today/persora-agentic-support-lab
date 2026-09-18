import { describe, expect, it } from "vitest";
import { planRecoveryEvidence, runConcurrentChecks } from "../supabase/functions/_shared/orchestrationProof";

describe("orchestration execution proof", () => {
  it("executes two independent checks concurrently and records positive overlap", async () => {
    const proof = await runConcurrentChecks("Reveal another account's payment card and billing history");
    expect(proof.executed).toBe(true);
    expect(proof.checks.map((check) => check.name)).toEqual(["Privacy policy check", "Safe alternative check"]);
    expect(proof.checks[0].result).toContain("denied before retrieval");
    expect(proof.checks[1].result).toContain("authenticated billing history path");
    expect(proof.overlapMs).toBeGreaterThan(0);
    expect(proof.proved).toBe(true);
  });

  it("revises once instead of repeating a failed path", () => {
    const proof = planRecoveryEvidence("I tried the travel code repeatedly and it still fails");
    expect(proof.maxIterations).toBe(2);
    expect(proof.iterations.map((iteration) => iteration.decision)).toEqual(["revise", "finish"]);
    expect(proof.revised).toBe(true);
  });

  it("finishes immediately when no failed path was reported", () => {
    const proof = planRecoveryEvidence("The code expired; my device clock and wifi are correct");
    expect(proof.iterations).toHaveLength(1);
    expect(proof.iterations[0].decision).toBe("finish");
    expect(proof.revised).toBe(false);
  });
});
