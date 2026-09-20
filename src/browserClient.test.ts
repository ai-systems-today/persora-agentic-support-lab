import { afterEach, describe, expect, it, vi } from "vitest";
import { openSourceInBrowser } from "./browserClient";

const response = (overrides: Record<string, unknown> = {}) => new Response(JSON.stringify({
  executed: true,
  provider: "playwright-mcp",
  url: "https://help.netflix.com/en/contactus?locale=en-US",
  title: null,
  screenshot: "base64",
  mimeType: "image/jpeg",
  presentation: "mobile-width",
  deviceProfile: null,
  observedChannels: ["call", "chat"],
  capturedAt: "2026-09-20T16:00:00.000Z",
  userContentTransmitted: false,
  ...overrides,
}), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("source browser client", () => {
  it("requests the bounded mobile interaction only for the exact contact path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);

    await openSourceInBrowser("https://help.netflix.com/en/contactus?locale=en-US");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      url: "https://help.netflix.com/en/contactus?locale=en-US",
      presentation: "mobile",
      interaction: "reveal-contact-options",
    });
  });

  it("keeps ordinary citations navigation-only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ presentation: "desktop", observedChannels: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await openSourceInBrowser("https://help.netflix.com/en/node/33335");

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ presentation: "desktop", interaction: "none" });
  });

  it("fails closed when exact-run proof metadata is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ executed: true, screenshot: "base64" }), { status: 200 })));
    await expect(openSourceInBrowser("https://help.netflix.com/en/node/33335")).rejects.toThrow("HTTP 200");
  });
});
