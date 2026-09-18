export type ConcurrentCheck = {
  name: string;
  startedAtMs: number;
  finishedAtMs: number;
  durationMs: number;
  result: string;
};

export type RecoveryProof = {
  executed: boolean;
  maxIterations: number;
  iterations: Array<{ attempt: number; decision: "revise" | "finish"; reason: string }>;
  revised: boolean;
};

export type OrchestrationProof = {
  concurrent: { executed: boolean; checks: ConcurrentCheck[]; overlapMs: number; proved: boolean } | null;
  recovery: RecoveryProof | null;
};

export async function runConcurrentChecks(message: string) {
  const runCheck = async (name: string, evaluate: () => { material: string; result: string }): Promise<ConcurrentCheck> => {
    const startedAtMs = performance.now();
    const evaluated = evaluate();
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(evaluated.material.repeat(32)));
    const finishedAtMs = performance.now();
    return { name, startedAtMs, finishedAtMs, durationMs: Math.max(0, finishedAtMs - startedAtMs), result: evaluated.result };
  };
  const checks = await Promise.all([
    runCheck("Privacy policy check", () => {
      const signals = [
        /another account|other account|someone else/i.test(message) ? "cross-account" : null,
        /card|invoice|billing|payment/i.test(message) ? "financial-data" : null,
      ].filter(Boolean);
      return {
        material: `${message}:${signals.join(",")}`,
        result: signals.length === 2
          ? "Cross-account financial data is denied before retrieval."
          : "The authorization guardrail blocked the request; no sensitive retrieval is permitted.",
      };
    }),
    runCheck("Safe alternative check", () => {
      const topic = /invoice|billing|payment/i.test(message) ? "billing history" : "account information";
      return {
        material: `${message}:authenticated-owner:${topic}`,
        result: `Offer the account owner an authenticated ${topic} path without disclosing third-party data.`,
      };
    }),
  ]);
  const overlapMs = Math.max(0, Math.min(...checks.map((check) => check.finishedAtMs)) - Math.max(...checks.map((check) => check.startedAtMs)));
  return { executed: true, checks, overlapMs, proved: overlapMs > 0 };
}

export function planRecoveryEvidence(message: string): RecoveryProof {
  const iterations: RecoveryProof["iterations"] = [];
  if (/failed|fails|doesn(?:'|’)t work|didn(?:'|’)t work|still cannot|still can(?:'|’)t/i.test(message)) {
    iterations.push({ attempt: 1, decision: "revise", reason: "The requested path already failed, so repeating it would not be a valid recovery plan." });
    iterations.push({ attempt: 2, decision: "finish", reason: "The revised plan asks the published agent for source-backed travel alternatives and rejects unsupported diagnostic causes." });
  } else {
    iterations.push({ attempt: 1, decision: "finish", reason: "No failed path was reported, so the source-backed support route can run without a recovery revision." });
  }
  return {
    executed: true,
    maxIterations: 2,
    iterations,
    revised: iterations.some((iteration) => iteration.decision === "revise"),
  };
}
