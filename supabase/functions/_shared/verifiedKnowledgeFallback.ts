export type VerifiedKnowledgeTopic = "household-travel" | "travel-alternatives" | "household-gps";

export function verifiedKnowledgeTopic(message: string): VerifiedKnowledgeTopic | null {
  if (/\bgps\b/i.test(message)) return "household-gps";
  if (/temporary.*(?:failed|fails|doesn(?:'|’)t work|didn(?:'|’)t work)|(?:failed|fails).*temporary/i.test(message)) {
    return "travel-alternatives";
  }
  if (/\btravell?(?:ing)?\b.*\b(?:household|tv|device)\b|\b(?:household|tv|device)\b.*\btravell?(?:ing)?\b/i.test(message)) {
    return "household-travel";
  }
  return null;
}

export function verifiedKnowledgeAnswer(topic: VerifiedKnowledgeTopic, reference = 1): string {
  const cite = `[#${reference}]`;
  if (topic === "travel-alternatives") {
    return [
      "## Netflix options away from home",
      "",
      `- Travelers can use Netflix on supported mobile devices and computers ${cite}.`,
      `- Travelers can sign in on hotel or holiday-rental TVs by following the on-screen travel or temporary-access flow ${cite}.`,
      `- Netflix availability can vary by country ${cite}.`,
    ].join("\n");
  }
  if (topic === "household-gps") {
    return [
      "## Netflix Household location checks",
      "",
      `- Netflix does not collect GPS data to determine a device's precise physical location ${cite}.`,
      `- A Netflix Household is the group of devices connected to the internet at the main place where the account is watched ${cite}.`,
    ].join("\n");
  }
  return [
    "## Netflix Household while traveling",
    "",
    `- On the TV, choose **I'm Traveling** or **Watch Temporarily** ${cite}.`,
    `- Request the four-digit temporary access code through the account owner's email or text and enter it on the TV ${cite}.`,
    `- If this is the main home TV, update the Netflix Household from a TV on the preferred home internet connection and complete verification through the email or text link ${cite}.`,
  ].join("\n");
}
