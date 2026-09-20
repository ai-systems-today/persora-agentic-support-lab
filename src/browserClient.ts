import { SUPABASE_PUBLISHABLE_KEY } from "./liveClient";

export const SOURCE_BROWSER_URL = "https://oiotkbbwriecdvtnufee.supabase.co/functions/v1/support-source-browser";

export type SourceBrowserResult = {
  url: string;
  title: string | null;
  screenshot: string;
  mimeType: "image/jpeg" | "image/png";
  executed: true;
  provider: "playwright-mcp";
};

export async function openSourceInBrowser(url: string): Promise<SourceBrowserResult> {
  const response = await fetch(SOURCE_BROWSER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ url }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.executed !== true || typeof payload?.screenshot !== "string") {
    throw new Error(payload?.error ?? `Source browser returned HTTP ${response.status}.`);
  }
  return payload as SourceBrowserResult;
}
