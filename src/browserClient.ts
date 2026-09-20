import { SUPABASE_PUBLISHABLE_KEY } from "./liveClient";

export const SOURCE_BROWSER_URL = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/support-source-browser";

export type SourceBrowserResult = {
  url: string;
  title: string | null;
  screenshot: string;
  mimeType: "image/jpeg" | "image/png";
  executed: true;
  provider: "playwright-mcp";
  presentation: "desktop" | "mobile-width";
  deviceProfile: string | null;
  observedChannels: Array<"call" | "chat">;
  capturedAt: string;
  userContentTransmitted: false;
};

export async function openSourceInBrowser(url: string): Promise<SourceBrowserResult> {
  const target = new URL(url);
  const revealContactOptions = target.hostname === "help.netflix.com" && target.pathname === "/en/contactus";
  const response = await fetch(SOURCE_BROWSER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({
      url,
      presentation: revealContactOptions ? "mobile" : "desktop",
      interaction: revealContactOptions ? "reveal-contact-options" : "none",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  const validPresentation = payload?.presentation === "desktop" || payload?.presentation === "mobile-width";
  const validChannels = Array.isArray(payload?.observedChannels) && payload.observedChannels.every((value: unknown) => value === "call" || value === "chat");
  if (!response.ok || payload?.executed !== true || typeof payload?.screenshot !== "string" || !validPresentation || !validChannels || typeof payload?.capturedAt !== "string" || payload?.userContentTransmitted !== false) {
    throw new Error(payload?.error ?? `Source browser returned HTTP ${response.status}.`);
  }
  return payload as SourceBrowserResult;
}
