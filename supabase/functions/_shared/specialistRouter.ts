export type SpecialistDomain = "billing" | "household" | "identity" | "general";

export type SpecialistSelection = {
  domain: SpecialistDomain;
  agentId: string;
  agentName: string;
  widgetId: string;
};

const MULTI_DOMAIN_SCOPES: Record<SpecialistDomain, string> = {
  billing: "billing, payment, billing-country, or currency",
  household: "Netflix Household, travel, TV, device, or location verification",
  identity: "sign-in, password, account-email, phone, or account recovery",
  general: "general Netflix support",
};

export const NETFLIX_SPECIALISTS: Record<SpecialistDomain, SpecialistSelection> = {
  billing: {
    domain: "billing",
    agentId: "7223c1d3-ce6c-48a0-a65c-bfe1f9666966",
    agentName: "Netflix Billing Policy Specialist",
    widgetId: "d5a728ec-1d60-48de-8f5a-2efe5ef2c035",
  },
  household: {
    domain: "household",
    agentId: "638c8a0d-f151-461a-a948-0ffc1afc0f3d",
    agentName: "Netflix Household & Travel Specialist",
    widgetId: "6aef9740-a5b2-4ca9-9cb3-65e74f3072d6",
  },
  identity: {
    domain: "identity",
    agentId: "8576392a-ff6f-481b-8a1a-07a7e99fbd9c",
    agentName: "Netflix Account Access & Security Specialist",
    widgetId: "0986654e-33b8-4e29-92db-ed56839dbeb1",
  },
  general: {
    domain: "general",
    agentId: "33acd2d1-226b-4f46-935b-a016bda5ab57",
    agentName: "Netflix Support Assistant",
    widgetId: "6a01cc31-ee9e-4977-aa8c-031894a71851",
  },
};

const domainSignals: Array<{ domain: Exclude<SpecialistDomain, "general">; expression: RegExp }> = [
  { domain: "billing", expression: /\b(bill(?:ed|ing)?|payment|invoice|charge|refund|currency|billing country|payment method)\b/i },
  { domain: "household", expression: /\b(household|travel|travelling|temporary access|temporary code|device|tv|location|moving)\b/i },
  { domain: "identity", expression: /\b(email|phone|sign[ -]?in|login|password|account access|security|unauthori[sz]ed)\b/i },
];

export function selectSpecialists(message: string): SpecialistSelection[] {
  const matches = domainSignals
    .filter(({ expression }) => expression.test(message))
    .map(({ domain }) => NETFLIX_SPECIALISTS[domain]);
  return matches.length ? matches : [NETFLIX_SPECIALISTS.general];
}

export function selectPrimarySpecialist(message: string): SpecialistSelection {
  return selectSpecialists(message)[0];
}

export function specialistEvaluationQuestion(
  specialist: SpecialistSelection,
  originalMessage: string,
  multiDomain: boolean,
) {
  if (!multiDomain) return originalMessage;
  const signal = domainSignals.find(({ domain }) => domain === specialist.domain)?.expression;
  const matchingDetails = originalMessage
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((detail) => detail.trim())
    .filter((detail) => detail && signal?.test(detail));
  return matchingDetails.length ? matchingDetails.join("; ") : originalMessage;
}

export function specialistTaskMessage(
  specialist: SpecialistSelection,
  originalMessage: string,
  multiDomain: boolean,
) {
  if (!multiDomain) return originalMessage;
  const scopedDetail = specialistEvaluationQuestion(specialist, originalMessage, multiDomain);
  return `According to Netflix Help, answer only the ${MULTI_DOMAIN_SCOPES[specialist.domain]} part of this customer request and do not answer the other domains: ${scopedDetail}`;
}
