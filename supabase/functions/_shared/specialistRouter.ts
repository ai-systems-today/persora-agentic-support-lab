export type SpecialistDomain = "billing" | "household" | "identity" | "general";

export type SpecialistSelection = {
  domain: SpecialistDomain;
  agentId: string;
  agentName: string;
  widgetId: string;
};

const MULTI_DOMAIN_TASKS: Record<SpecialistDomain, string> = {
  billing: "According to Netflix Help, what should a customer do when moving to a new country and needing the billing country or currency changed?",
  household: "According to Netflix Help, how can a customer update Netflix Household from the TV they want to use?",
  identity: "How can a customer reset their Netflix sign-in password?",
  general: "According to Netflix Help, what supported steps address this request?",
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
  { domain: "identity", expression: /\b(email|phone|sign[ -]?in|login|password|account access|verification|security|unauthori[sz]ed)\b/i },
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

export function specialistTaskMessage(
  specialist: SpecialistSelection,
  originalMessage: string,
  multiDomain: boolean,
) {
  return multiDomain ? MULTI_DOMAIN_TASKS[specialist.domain] : originalMessage;
}
