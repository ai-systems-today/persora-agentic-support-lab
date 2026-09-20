import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("compact Netflix support chat", () => {
  it("keeps starters beside the composer and populates the selected question", () => {
    expect(appSource).toContain('className="starter-strip"');
    expect(appSource).toContain("setDraft(item.customer)");
    expect(appSource).toContain("await submitQuestion(item.customer, item)");
  });

  it("shows measured response time and animated send feedback", () => {
    expect(appSource).toContain("performance.now()");
    expect(appSource).toContain('className="elapsed"');
    expect(appSource).toContain('className="typing-dots"');
  });

  it("uses a dedicated transcript scroller above a fixed composer region", () => {
    expect(appSource).toContain('className="chat-scroll"');
    expect(appSource).toContain("conversationEndRef.current?.scrollIntoView");
    expect(styles).toContain(".chat-panel { min-width: 0; height:");
    expect(styles).toContain(".chat-scroll { flex: 1;");
    expect(styles).toContain(".composer-dock { position: relative; flex: 0 0 auto;");
  });
});
