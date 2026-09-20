export const CONTACT_PATH = "/en/contactus";
export const CONTACT_ISSUE = "I want to contact Netflix Customer Service";

export type SourcePresentation = "desktop" | "mobile";
export type SourceInteraction = "none" | "reveal-contact-options";

export function netflixIssueTextboxRef(snapshot: string): string | null {
  return snapshot.match(/\btextbox\s+"Describe your issue"[^\n]*\[ref=([^\]\s]+)\]/i)?.[1] ?? null;
}

export function isSafeContactTarget(url: URL) {
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "help.netflix.com" || url.pathname !== CONTACT_PATH) return false;
  if ([...url.searchParams.keys()].some((key) => key !== "locale")) return false;
  const locale = url.searchParams.get("locale");
  return locale === null || /^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale);
}

export function sourceBrowserMode(body: { presentation?: unknown; interaction?: unknown }, target: URL): {
  presentation: SourcePresentation;
  interaction: SourceInteraction;
  error: string | null;
} {
  const presentation: SourcePresentation = body.presentation === "mobile" ? "mobile" : "desktop";
  const interaction: SourceInteraction = body.interaction === "reveal-contact-options" ? "reveal-contact-options" : "none";
  const error = interaction === "reveal-contact-options" && (presentation !== "mobile" || !isSafeContactTarget(target))
    ? "contact_interaction_requires_exact_mobile_contact_url"
    : null;
  return { presentation, interaction, error };
}
