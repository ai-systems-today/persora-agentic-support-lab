export type Pattern = "sequential" | "concurrent" | "group-chat" | "handoff" | "magentic";

export type RoutingDecision = {
  pattern: Pattern;
  reason: string;
  signals: string[];
  confidence: number;
};

type RouteRule = {
  pattern: Pattern;
  reason: string;
  signals: Array<{ label: string; expression: RegExp }>;
};

const rules: RouteRule[] = [
  {
    pattern: "concurrent",
    reason: "The request involves sensitive cross-account data, so independent privacy and safe-alternative checks run together.",
    signals: [
      { label: "cross-account request", expression: /\b(another|other|someone else(?:'s)?) account\b/i },
      { label: "sensitive billing data", expression: /\b(reveal|show|display|access)\b.{0,32}\b(card|invoice|payment|billing)\b/i },
    ],
  },
  {
    pattern: "handoff",
    reason: "The request asks for an account or payment mutation that requires authenticated human approval.",
    signals: [
      {
        label: "account mutation",
        expression: /\b(?:cancel|close|delete)\s+(?:my\s+|the\s+)?(?:subscription|membership|account)\b|\b(?:subscription|membership|account)\b\s+(?:is\s+|was\s+|has\s+been\s+)?(?:cancelled|canceled|closed|deleted)\b/i,
      },
      { label: "financial decision", expression: /\b(refund|chargeback|reverse (?:a )?charge)\b/i },
    ],
  },
  {
    pattern: "magentic",
    reason: "The user reports a failed or repeated recovery attempt, so a planner selects bounded next steps.",
    signals: [
      { label: "failed attempt", expression: /\b(failed|doesn(?:'|’)t work|didn(?:'|’)t work|still cannot|still can(?:'|’)t)\b/i },
      { label: "repeated attempt", expression: /\b(tried|again|temporary code|keeps? (?:failing|looping))\b/i },
    ],
  },
];

const domainSignals = [
  { label: "billing", expression: /\b(billing|payment|invoice|charge|country)\b/i },
  { label: "household", expression: /\b(household|device|tv|location)\b/i },
  { label: "identity", expression: /\b(email|sign[ -]?in|login|password|account access)\b/i },
];

export function selectOrchestrationPattern(message: string): RoutingDecision {
  const text = message.trim();

  for (const rule of rules) {
    const matched = rule.signals.filter((signal) => signal.expression.test(text)).map((signal) => signal.label);
    if (matched.length > 0) {
      return {
        pattern: rule.pattern,
        reason: rule.reason,
        signals: matched,
        confidence: Math.min(0.98, 0.82 + (matched.length - 1) * 0.08),
      };
    }
  }

  const domains = domainSignals.filter((signal) => signal.expression.test(text)).map((signal) => signal.label);
  if (domains.length >= 2) {
    return {
      pattern: "group-chat",
      reason: "The question spans multiple support domains, so the matching A2A specialist results are gathered and transparently aggregated.",
      signals: domains,
      confidence: Math.min(0.96, 0.8 + domains.length * 0.05),
    };
  }

  return {
    pattern: "sequential",
    reason: "The request is a single grounded support question with no mutation, privacy, recovery, or multi-domain signal.",
    signals: domains.length ? domains : ["single support intent"],
    confidence: 0.72,
  };
}
