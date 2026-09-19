import { describe, expect, it } from "vitest";
import { citationEvidenceText, normalizeCitationBundle, orderCitations, selectReferencedContexts } from "../supabase/functions/_shared/citationEvidence";

describe("citation evidence normalization", () => {
  it("orders upstream citations by the source numbers used in the answer", () => {
    const values = [{ index: 1 }, { index: 8 }, { index: 2 }];
    expect(orderCitations(values)).toEqual([{ index: 1 }, { index: 2 }, { index: 8 }]);
  });

  it("includes exact locator text instead of validating against a truncated snippet alone", () => {
    expect(citationEvidenceText({
      snippet: "Netflix is easy to use when traveling.",
      locator: { exact_quote_end: "Downloaded titles may not be available in another country." },
    })).toContain("Downloaded titles may not be available in another country.");
  });

  it("renumbers answer references with sparse upstream citation indices", () => {
    expect(normalizeCitationBundle(
      "Use the first source [#1], then the ninth [#9], then the third [#3].",
      [{ index: 1, title: "one" }, { index: 9, title: "nine" }, { index: 3, title: "three" }],
    )).toEqual({
      answer: "Use the first source [#1], then the ninth [#3], then the third [#2].",
      citations: [{ index: 1, title: "one" }, { index: 2, title: "three" }, { index: 3, title: "nine" }],
    });
  });

  it("selects the exact cited contexts while preserving their original labels", () => {
    const contexts = ["[#1] Billing", "[#2] Noise", "[#3] Household", "[#4] Identity"];
    expect(selectReferencedContexts("Use [#1], then [#3] and [#4].", contexts)).toEqual([
      "[#1] Billing",
      "[#3] Household",
      "[#4] Identity",
    ]);
  });
});
