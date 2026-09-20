import { describe, expect, it } from "vitest";
import { CONTACT_ISSUE, isSafeContactTarget, netflixIssueTextboxRef, sourceBrowserMode } from "../supabase/functions/_shared/sourceBrowserPolicy";

describe("source browser contact policy", () => {
  it("allows only the exact Netflix contact path with a bounded locale", () => {
    expect(isSafeContactTarget(new URL("https://help.netflix.com/en/contactus?locale=en-US"))).toBe(true);
    expect(isSafeContactTarget(new URL("https://help.netflix.com/en/contactus?locale=en"))).toBe(true);
    expect(isSafeContactTarget(new URL("https://help.netflix.com/en/node/33335"))).toBe(false);
    expect(isSafeContactTarget(new URL("https://help.netflix.com/en/contactus?next=https://example.com"))).toBe(false);
    expect(isSafeContactTarget(new URL("https://example.com/en/contactus?locale=en-US"))).toBe(false);
  });

  it("requires mobile presentation for the bounded interaction", () => {
    const target = new URL("https://help.netflix.com/en/contactus?locale=en-US");
    expect(sourceBrowserMode({ presentation: "mobile", interaction: "reveal-contact-options" }, target)).toEqual({
      presentation: "mobile",
      interaction: "reveal-contact-options",
      error: null,
    });
    expect(sourceBrowserMode({ presentation: "desktop", interaction: "reveal-contact-options" }, target).error).toBe("contact_interaction_requires_exact_mobile_contact_url");
  });

  it("keeps the submitted issue server-owned and non-sensitive", () => {
    expect(CONTACT_ISSUE).toBe("I want to contact Netflix Customer Service");
    expect(CONTACT_ISSUE).not.toMatch(/account|card|email|password|refund/i);
  });

  it("extracts the current MCP element ref instead of relying on a CSS selector", () => {
    expect(netflixIssueTextboxRef('- textbox "Describe your issue" [active] [ref=e27]')).toBe("e27");
    expect(netflixIssueTextboxRef('- textbox "Another field" [ref=e28]')).toBeNull();
  });
});
