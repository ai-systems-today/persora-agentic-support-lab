import { describe, expect, it } from "vitest";
import { applyAgUiPayload, applySsePayload } from "./liveClient";
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

  it("assembles a standards-based AG-UI answer and evidence envelope", () => {
    let state: StreamState = { answer: "", citations: [], eventTypes: [], protocolEvents: [] };
    state = applyAgUiPayload(state, JSON.stringify({ type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" }));
    state = applyAgUiPayload(state, JSON.stringify({ type: "TEXT_MESSAGE_CONTENT", messageId: "message-1", delta: "Grounded answer" }));
    state = applyAgUiPayload(state, JSON.stringify({
      type: "CUSTOM",
      name: "persora.evidence",
      value: {
        evidence: { traceId: "trace-1", eventTypes: [], citations: [] },
        citations: [{ title: "Netflix Help", url: "https://help.netflix.com/en/node/100262" }],
      },
    }));

    expect(state.answer).toBe("Grounded answer");
    expect(state.eventTypes).toEqual(["RUN_STARTED", "TEXT_MESSAGE_CONTENT", "CUSTOM"]);
    expect(state.protocolEvents).toHaveLength(3);
    expect(state.evidence?.traceId).toBe("trace-1");
    expect(state.citations[0].label).toBe("Netflix Help");
  });
});
