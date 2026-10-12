import { describe, expect, it } from "vitest";
import { allowServerCapture, parseUpstreamEvidence, retrievalWindow, type UpstreamRetrievalEvidence } from "../supabase/functions/_shared/upstreamRetrievalEvidence";

describe("upstream evidence trust and timing", () => {
  it("rejects a public opt-in and accepts only the existing service credential", () => {
    expect(allowServerCapture("Bearer public", "secret", true)).toBe(false);
    expect(allowServerCapture("Bearer secret", "secret", false)).toBe(false);
    expect(allowServerCapture("Bearer secret", "secret", true)).toBe(true);
  });
  it("rejects evidence for another run or altered context", async () => {
    const context = "actual passage";
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(context))), b => b.toString(16).padStart(2, "0")).join("");
    const evidence = { schemaVersion: "1.0", requestId: "run", passages: [{ text: context, label: "source", rank: 1 }], searches: [], generatorContext: context, generatorContextHash: hash, generatorContextCaptured: true };
    expect(await parseUpstreamEvidence(evidence, "run")).not.toBeNull();
    expect(await parseUpstreamEvidence(evidence, "another-run")).toBeNull();
    expect(await parseUpstreamEvidence({ ...evidence, generatorContext: "altered" }, "run")).toBeNull();
  });
  it("uses elapsed parallel retrieval time rather than summing overlapping durations", () => {
    const captures = [
      { retrievalStartedAt: "2026-10-12T00:00:00.000Z", retrievalFinishedAt: "2026-10-12T00:00:01.000Z" },
      { retrievalStartedAt: "2026-10-12T00:00:00.500Z", retrievalFinishedAt: "2026-10-12T00:00:01.500Z" },
    ] as UpstreamRetrievalEvidence[];
    expect(retrievalWindow(captures)).toBe(1500);
    expect(retrievalWindow([captures[0], { ...captures[1], retrievalStartedAt: null }])).toBeNull();
    expect(retrievalWindow([])).toBeNull();
  });
});
