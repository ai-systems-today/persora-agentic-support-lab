import { describe, expect, it } from "vitest";
import { applySsePayload } from "./liveClient";
import type { StreamState } from "./liveClient";

describe("Persora event stream", () => {
  it("assembles streamed answer deltas and citations", () => {
    let state: StreamState = { answer: "", citations: [], eventTypes: [] };
    state = applySsePayload(state, JSON.stringify({ choices: [{ delta: { content: "Hello " } }] }));
    state = applySsePayload(state, JSON.stringify({ choices: [{ delta: { content: "there" } }] }));
    state = applySsePayload(state, JSON.stringify({
      type: "citations",
      citations: [{ title: "Netflix Help", url: "https://help.netflix.com/en/node/100262", similarity: 0.82 }],
    }));

    expect(state.answer).toBe("Hello there");
    expect(state.citations).toEqual([{
      label: "Netflix Help",
      url: "https://help.netflix.com/en/node/100262",
      snippet: null,
      similarity: 0.82,
    }]);
    expect(state.eventTypes).toEqual(["message", "citations"]);
  });

  it("ignores malformed event payloads", () => {
    const state: StreamState = { answer: "safe", citations: [], eventTypes: [] };
    expect(applySsePayload(state, "not-json")).toEqual(state);
  });
});
