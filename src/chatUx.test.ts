import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("compact Netflix support chat", () => {
  it("uses the supplied Persora and Netflix brand assets", () => {
    expect(appSource).toContain("persora-heart.png");
    expect(appSource).toContain("netflix-support-logo.png");
    expect(appSource).not.toContain('aria-label="Persora">♥');
    expect(appSource).not.toContain('className="assistant-avatar">N');
  });

  it("keeps every starter in a labelled examples menu and populates the selected question", () => {
    expect(appSource).toContain('className="examples-menu"');
    expect(appSource).toContain("Examples · {cases.length}");
    expect(appSource).toContain("setDraft(item.customer)");
    expect(appSource).toContain("await submitQuestion(item.customer, item)");
  });

  it("keeps dropdown panels visible above the composer", () => {
    expect(styles).toContain(".composer-dock { position: relative; flex: 0 0 auto;");
    expect(styles).toContain("overflow: visible;");
    expect(styles).not.toContain(".composer-dock { position: relative; flex: 0 0 auto; z-index: 8; margin: 0; border-top: 1px solid #2a4262; background: rgba(8, 18, 31, .98); backdrop-filter: blur(18px); box-shadow: 0 -18px 48px #0007; overflow: hidden;");
  });

  it("moves a follow-up into the prompt without submitting it", () => {
    expect(appSource).toContain("const selectFollowUp = (question: string) =>");
    expect(appSource).toContain("setDraft(question)");
    expect(appSource).toContain("onClick={() => selectFollowUp(question)}");
    expect(appSource).not.toContain("onClick={() => void submitQuestion(question)}");
  });

  it("uses one explained answer-mode menu", () => {
    expect(appSource).toContain('className="mode-menu"');
    expect(appSource).toContain("Demo replay");
    expect(appSource).toContain("Live answer");
    expect(appSource).toContain("Full agentic run");
    expect(appSource).not.toContain('className="mode-switch"');
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

  it("keeps the agent identity sticky and collapses secondary answer content", () => {
    expect(styles).toContain(".assistant-intro { position: sticky;");
    expect(appSource).toContain('<details className="citations">');
    expect(appSource).toContain('<details className="follow-ups">');
    expect(styles).toContain("overflow-wrap: anywhere");
  });

  it("offers a reversible new-conversation action", () => {
    expect(appSource).toContain("const resetConversation = () =>");
    expect(appSource).toContain("setTurns([])");
    expect(appSource).toContain(">New conversation</button>");
  });
});
