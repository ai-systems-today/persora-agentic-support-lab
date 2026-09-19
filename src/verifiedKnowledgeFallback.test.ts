import { describe, expect, it } from "vitest";
import { evaluateLiveAnswer } from "../supabase/functions/_shared/answerQuality";
import { verifiedKnowledgeAnswer, verifiedKnowledgeTopic } from "../supabase/functions/_shared/verifiedKnowledgeFallback";

const chunkOne = `# Netflix Household and travel: verified support facts
## Temporary access while traveling
When a TV says that it is not part of the account's Netflix Household, a traveler can choose I'm Traveling or Watch Temporarily on that TV. Netflix then lets the account owner request a temporary access code by email or text. The traveler enters the four-digit code on the TV to continue watching temporarily.
## Updating the Netflix Household
If the TV belongs at the account owner's main viewing location, the account owner can choose Update Netflix Household from a TV connected to the preferred home internet connection. Netflix sends a verification link by email or text so the account owner can confirm the update.`;

const chunkTwo = `## Using Netflix away from home
People traveling can use Netflix on supported mobile devices and computers. They can also sign in on TVs at hotels or holiday rentals by following the on-screen travel or temporary-access flow. Netflix availability can vary by country.
## Device and location rules
A Netflix Household is the group of devices connected to the internet at the main place where the account is watched. Netflix says it does not collect GPS data to determine a device's precise physical location.`;

describe("verified shared-KB fallback", () => {
  it.each([
    ["I am travelling and Netflix says this TV is not part of my household. What should I do?", "household-travel", chunkOne],
    ["My temporary Netflix travel access failed. Can I use Netflix on a mobile device, computer, or hotel TV instead?", "travel-alternatives", chunkTwo],
    ["Does Netflix use GPS to decide which devices belong to my Netflix Household?", "household-gps", chunkTwo],
  ] as const)("builds a fully cited answer for %s", (question, topic, source) => {
    expect(verifiedKnowledgeTopic(question)).toBe(topic);
    const answer = verifiedKnowledgeAnswer(topic);
    const requiredTopics = topic === "household-travel"
      ? [
        { label: "temporary travel access", terms: ["temporary"] },
        { label: "verification", terms: ["verify", "verification"] },
        { label: "Household update", terms: ["update"] },
      ]
      : topic === "travel-alternatives"
        ? [
          { label: "mobile device", terms: ["mobile", "phone", "tablet"] },
          { label: "computer", terms: ["computer", "laptop"] },
          { label: "hotel TV", terms: ["hotel", "holiday rental"] },
        ]
        : [];
    expect(evaluateLiveAnswer({
      question,
      answer,
      citations: [{ label: "Netflix Household and travel: verified support facts", url: null, snippet: source }],
      requiredTopics,
    })).toMatchObject({ status: "passed", grounding: 1, citationValidity: 1 });
  });

  it("does not activate for an unrelated billing question", () => {
    expect(verifiedKnowledgeTopic("How do I review a billing charge?")).toBeNull();
  });
});
