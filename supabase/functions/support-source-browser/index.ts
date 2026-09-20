import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://ai-systems-today.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const ALLOWED_HOSTS = new Set(["help.netflix.com"]);
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ai-systems-today.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

function json(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

function acceptRequest(key: string) {
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

function safeUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

async function mcpCall(baseUrl: string, id: number, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!response.ok) throw new Error(`playwright_mcp_http_${response.status}`);
  const payload = await response.json();
  if (payload?.error) throw new Error("playwright_mcp_tool_error");
  return payload?.result;
}

function screenshotFrom(result: unknown): { data: string; mimeType: "image/jpeg" | "image/png" } | null {
  const blocks = (result as { content?: unknown[] } | null)?.content;
  if (!Array.isArray(blocks)) return null;
  for (const block of blocks) {
    const item = block as { type?: string; data?: string; mimeType?: string };
    if (item.type === "image" && typeof item.data === "string") {
      return { data: item.data, mimeType: item.mimeType === "image/jpeg" ? "image/jpeg" : "image/png" };
    }
  }
  return null;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return json(origin, 405, { error: "method_not_allowed" });
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json(origin, 403, { error: "origin_not_allowed" });

  const rateKey = `${request.headers.get("x-forwarded-for") ?? "unknown"}:${origin}`;
  if (!acceptRequest(rateKey)) return json(origin, 429, { error: "rate_limit_exceeded" });

  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  const target = safeUrl(body?.url);
  if (!target) return json(origin, 400, { error: "only_https_help_netflix_com_is_allowed" });

  const baseUrl = Deno.env.get("PLAYWRIGHT_MCP_URL")?.trim();
  if (!baseUrl) return json(origin, 503, { error: "playwright_mcp_not_configured" });

  try {
    await mcpCall(baseUrl, 1, "browser_navigate", { url: target.toString() });
    const screenshotResult = await mcpCall(baseUrl, 2, "browser_take_screenshot", { type: "jpeg", quality: 72, fullPage: false });
    const screenshot = screenshotFrom(screenshotResult);
    if (!screenshot) return json(origin, 502, { error: "playwright_screenshot_missing" });
    return json(origin, 200, {
      executed: true,
      provider: "playwright-mcp",
      url: target.toString(),
      title: null,
      screenshot: screenshot.data,
      mimeType: screenshot.mimeType,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "playwright_source_browser_failed";
    return json(origin, 502, { error: reason.slice(0, 120) });
  }
});
