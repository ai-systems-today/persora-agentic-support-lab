import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cases } from "./data";
import { askAgenticDemo, askPublishedAgent, readLangfuseMirror, resolveAgenticHandoff } from "./liveClient";
import { formatRetrievalScore } from "./retrievalScore";
import type { ChatTurn, DemoCase, EvidenceLayer, EvidenceStatus, GraphNode, Pattern, RunProgress } from "./types";
import { selectOrchestrationPattern } from "../supabase/functions/_shared/orchestrationRouter";
import { openSourceInBrowser, type SourceBrowserResult } from "./browserClient";

const statusLabel: Record<EvidenceStatus, string> = {
  "runtime-proven": "Runtime-proven",
  "repo-defined": "Repo-defined",
  "fixture-replay": "Fixture replay",
  "not-captured": "Not captured",
  "not-executed": "Not executed",
  "not-evaluated": "Not evaluated",
};

const patternDescription: Record<Pattern, string> = {
  sequential: "Each step completes before the next begins.",
  concurrent: "Independent checks run side by side, then converge.",
  "group-chat": "A coordinator gathers distinct A2A specialist results and returns their grounded aggregation.",
  handoff: "Control transfers when authorization or human judgment is required.",
  magentic: "A bounded planner either finishes or revises once from request state, then stops.",
};

type AnswerSource = "fixture" | "live" | "agentic";
const sourceLabel: Record<AnswerSource, string> = {
  fixture: "Demo replay",
  live: "Live answer",
  agentic: "Full agentic run",
};

function normalizeAssistantMarkdown(answer: string) {
  return answer
    .replace(/([^\n])\s+(#{1,6}\s+)/g, "$1\n\n$2")
    .replace(/([^\n])\s+(\d+\.\s+\*\*)/g, "$1\n\n$2");
}

function Header() {
  return (
    <header className="app-header">
      <div className="brand-mark" aria-label="Persora">♥</div>
      <div className="brand-copy">
        <strong>Persora</strong>
        <span>Agentic Evidence Lab</span>
      </div>
      <div className="mode"><i /> Evidence-first support demonstration</div>
    </header>
  );
}

function Conversation({ turns, onAsk, onExplain, onReset, source, onSourceChange, progress }: {
  turns: ChatTurn[];
  onAsk: (question: string, selectedCase?: DemoCase) => Promise<void>;
  onExplain: (turn: ChatTurn) => void;
  onReset: () => void;
  source: AnswerSource;
  onSourceChange: (value: AnswerSource) => void;
  progress: RunProgress | null;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [browser, setBrowser] = useState<SourceBrowserResult | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [browserState, setBrowserState] = useState<"idle" | "loading" | "error">("idle");
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [starterAnimating, setStarterAnimating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const examplesRef = useRef<HTMLDetailsElement>(null);
  const modeRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, submitting, progress?.label]);

  useEffect(() => {
    if (!submitting) return;
    const startedAt = performance.now();
    setElapsedMs(0);
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 100);
    return () => window.clearInterval(timer);
  }, [submitting]);

  const openCitation = async (url: string) => {
    setBrowserUrl(url);
    setBrowserState("loading");
    setBrowserError(null);
    try {
      setBrowser(await openSourceInBrowser(url));
      setBrowserState("idle");
    } catch (error) {
      setBrowserState("error");
      setBrowserError(error instanceof Error ? error.message : "The live source browser failed.");
    }
  };

  const submitQuestion = async (question: string, selectedCase?: DemoCase) => {
    if (!question) return;
    setSubmitting(true);
    try {
      await onAsk(question, selectedCase);
      setDraft("");
    } finally {
      setSubmitting(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const submit = async () => {
    await submitQuestion(draft.trim());
  };

  const askStarter = async (item: DemoCase) => {
    examplesRef.current?.removeAttribute("open");
    setDraft(item.customer);
    setStarterAnimating(true);
    inputRef.current?.focus();
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    setStarterAnimating(false);
    await submitQuestion(item.customer, item);
  };

  return (
    <main className="workspace-shell">
      <section className="source-browser" aria-label="Live citation browser">
        <div className="browser-toolbar">
          <span className="browser-status"><i /> {browser?.executed ? "Playwright-MCP live source" : "Source browser"}</span>
          <div className="browser-address">{browserUrl ?? "Select a returned citation to open its original webpage"}</div>
          {browserUrl && <a href={browserUrl} target="_blank" rel="noreferrer" title="Open the original page in a new tab">↗</a>}
        </div>
        <div className="browser-stage">
          {browserState === "loading" && <div className="browser-empty"><div className="progress-pulse"><i /></div><strong>Playwright is opening the original source…</strong></div>}
          {browserState === "error" && <div className="browser-empty browser-failure"><strong>Live browser unavailable</strong><p>{browserError}</p>{browserUrl && <a href={browserUrl} target="_blank" rel="noreferrer">Open original source directly ↗</a>}</div>}
          {browserState !== "loading" && browser && <img src={`data:${browser.mimeType};base64,${browser.screenshot}`} alt={`Live Playwright view of ${browser.url}`} />}
          {browserState === "idle" && !browser && <div className="browser-empty"><div className="empty-orbit"><span /></div><strong>Original source workspace</strong><p>Ask a question, then choose a citation. The server-side Playwright browser will navigate to the real Netflix Help page.</p></div>}
        </div>
      </section>

      <section className="chat-panel">
      <div className="chat-scroll">
      <section className="assistant-intro">
        <div className="assistant-avatar">N</div>
        <div><h1>Netflix Support</h1><p>Hi, I’m the Netflix Support Assistant. How can I help?</p><small>Powered by Persora <b>♥</b></small></div>
        {turns.length > 0 && <button className="new-conversation" type="button" onClick={onReset}>New conversation</button>}
      </section>

      <section className="conversation" aria-live="polite">
        {turns.length === 0 ? (
          <div className="empty-state">
            <strong>Ask naturally.</strong>
            <p>Choose an example below or type your own Netflix support question.</p>
          </div>
        ) : (
          turns.map((turn) => (
            <div className="turn" key={turn.id}>
              <div className="message customer"><span>You</span><p>{turn.question}</p></div>
              <div className="message assistant">
                <span>Netflix Support</span>
                <div className="answer-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
                    }}
                  >
                    {normalizeAssistantMarkdown(turn.answer)}
                  </ReactMarkdown>
                </div>
                {turn.runtime.citations.length > 0 && <details className="citations">
                  <summary><span>Sources · {turn.runtime.citations.length}</span>{turn.runtime.quality?.status === "failed" && <em>Citation format issue</em>}<b>⌄</b></summary>
                  <div>{turn.runtime.citations.map((citation, index) => <article key={`${citation.url ?? citation.label}-${index}`}>
                    {citation.url
                      ? <button type="button" onClick={() => void openCitation(citation.url!)}>{index + 1}. {citation.label}</button>
                      : <span>{index + 1}. {citation.label}</span>}
                    {citation.snippet && <small>{citation.snippet}</small>}
                  </article>)}</div>
                </details>}
                <div className="answer-footer">
                  <div><i /> Answered in {(turn.runtime.totalMs / 1000).toFixed(1)}s</div>
                  {turn.demoCase && <button onClick={() => onExplain(turn)}>Explain this answer <b>↗</b></button>}
                </div>
                {turn.runtime.followUps && turn.runtime.followUps.length > 0 && <details className="follow-ups">
                  <summary><span>Continue conversation · {turn.runtime.followUps.length}</span><b>⌄</b></summary>
                  <div>{turn.runtime.followUps.map((question) => <button key={question} disabled={submitting} onClick={() => void submitQuestion(question)}>{question}<span>↗</span></button>)}</div>
                </details>}
              </div>
            </div>
          ))
        )}
        {submitting && progress && <div className="live-progress" role="status">
          <div className="progress-pulse"><i /></div>
          <div><span>LIVE ORCHESTRATION</span><strong>{progress.label}</strong><small>{progress.events.length} protocol events received · trace {progress.traceId.slice(0, 8)}</small></div>
        </div>}
        <div ref={conversationEndRef} />
      </section>
      </div>

      <div className={`composer-dock ${source !== "fixture" ? "live" : "fixture"}`}>
        <div className="composer-tools">
          <details className="examples-menu" ref={examplesRef}>
            <summary>Examples · {cases.length} <b>⌄</b></summary>
            <div>{cases.map((item, index) => <button type="button" key={item.id} disabled={submitting} onClick={() => void askStarter(item)}><span>0{index + 1}</span><strong>{item.starter}</strong></button>)}</div>
          </details>
          <details className="mode-menu" ref={modeRef}>
            <summary>{sourceLabel[source]} <b>⌄</b></summary>
            <div role="group" aria-label="Choose answer source">
              <button type="button" className={source === "fixture" ? "active" : ""} onClick={() => { onSourceChange("fixture"); modeRef.current?.removeAttribute("open"); }}><strong>Demo replay</strong><small>Local deterministic example; no network request.</small></button>
              <button type="button" className={source === "live" ? "active" : ""} onClick={() => { onSourceChange("live"); modeRef.current?.removeAttribute("open"); }}><strong>Live answer</strong><small>Published Netflix agent with live citations.</small></button>
              <button type="button" className={source === "agentic" ? "active" : ""} onClick={() => { onSourceChange("agentic"); modeRef.current?.removeAttribute("open"); }}><strong>Full agentic run</strong><small>Routing, guardrail, LangGraph, evaluation and trace.</small></button>
            </div>
          </details>
        </div>
        <form className={`composer ${starterAnimating ? "starter-loading" : ""}`} onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <input ref={inputRef} aria-label="Message" disabled={submitting} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={submitting ? "Netflix Support is working…" : "Ask Netflix Support…"} />
          {submitting && <output className="elapsed" aria-live="off">{(elapsedMs / 1000).toFixed(1)}s</output>}
          <button aria-label="Send" disabled={submitting} title="Send question">{submitting ? <span className="typing-dots"><i /><i /><i /></span> : "↑"}</button>
        </form>
      </div>
      </section>
    </main>
  );
}

const nodeKind = (id: string): NonNullable<GraphNode["kind"]> => {
  if (/published_netflix_agent|group_a2a_specialist|specialist/.test(id)) return "agent";
  if (/knowledge|retrieval|kb/.test(id)) return "knowledge";
  if (/human|handoff|approval|decision/.test(id)) return "human";
  if (/validation|quality|evaluation/.test(id)) return "quality";
  return "orchestrator";
};

const nodeKindLabel: Record<NonNullable<GraphNode["kind"]>, string> = {
  customer: "Customer",
  orchestrator: "LangGraph",
  agent: "Agent",
  knowledge: "Knowledge/tool",
  human: "Human",
  quality: "Quality",
};

function PatternGraph({ nodes, pattern, selectedNode, onSelect }: {
  nodes: GraphNode[];
  pattern: Pattern;
  selectedNode: string;
  onSelect: (node: GraphNode) => void;
}) {
  const renderNode = (node: GraphNode, index: number) => (
    <button className={`graph-node ${node.state} ${selectedNode === node.id ? "selected" : ""}`} key={`${node.id}-${index}`} onClick={() => onSelect(node)}>
      <span>{index + 1}</span><em className={`node-kind ${node.kind ?? nodeKind(node.id)}`}>{nodeKindLabel[node.kind ?? nodeKind(node.id)]}</em><strong>{node.label}</strong><small>{node.role}</small>
    </button>
  );

  const topology = (() => {
    if (pattern === "concurrent") {
      return <div className="topology concurrent-topology">
        {renderNode(nodes[0], 0)}<div className="fork">split</div><div className="parallel-stack">{nodes.slice(1, -1).map((node, index) => renderNode(node, index + 1))}</div><div className="join">join</div>{renderNode(nodes.at(-1)!, nodes.length - 1)}
      </div>;
    }
    if (pattern === "group-chat") {
      return <div className="topology group-topology">{nodes.map((node, index) => <div className="graph-unit" key={node.id}>{renderNode(node, index)}{index < nodes.length - 1 && <div className="connector"><i /></div>}</div>)}</div>;
    }
    if (pattern === "handoff") {
      return <div className="topology handoff-topology">
        <div className="lane"><b>AI lane</b>{nodes.slice(0, 2).map(renderNode)}</div>
        <div className="handoff-gate">authorization<br />handoff →</div>
        <div className="lane human"><b>Human lane</b>{nodes.slice(2).map((node, index) => renderNode(node, index + 2))}</div>
      </div>;
    }
    if (pattern === "magentic") {
      return <div className="topology planner-topology">
        {renderNode(nodes[0], 0)}<div className="loop-arrow">plan ↓</div>{renderNode(nodes[1], 1)}<div className="worker-row">{nodes.slice(2).map((node, index) => renderNode(node, index + 2))}</div><div className="loop-label">↶ revise when result is insufficient</div>
      </div>;
    }
    return <div className="topology sequential-topology">{nodes.map((node, index) => <div className="graph-unit" key={node.id}>{renderNode(node, index)}{index < nodes.length - 1 && <div className="connector"><i /></div>}</div>)}</div>;
  })();

  return (
    <div className="graph-card">
      <div className="card-heading">
        <div><span>Execution graph</span><strong>{pattern}</strong></div>
        <p>{patternDescription[pattern]}</p>
      </div>
      <div className="actor-lanes">
        {(["customer", "orchestrator", "agent", "knowledge", "human", "quality"] as const).map((kind) => <span className={kind} key={kind}>{nodeKindLabel[kind]}</span>)}
      </div>
      <div className={`graph pattern-${pattern}`}>{topology}</div>
      <div className="legend">
        <span><i className="complete" /> complete</span>
        <span><i className="active" /> active</span>
        <span><i className="waiting" /> waiting</span>
      </div>
    </div>
  );
}

function ExecutionVisuals({ turn }: { turn: ChatTurn }) {
  const item = turn.demoCase!;
  const [view, setView] = useState<"graph" | "timeline" | "evidence">("graph");
  const source = item.layers.find((layer) => layer.id === "content")?.fields[0]?.value ?? "Fixture source";
  const pattern = turn.runtime.pattern ?? item.pattern;
  const publishedExecuted = turn.runtime.mode === "live" || Boolean(turn.runtime.nodeTrace?.some((entry) => entry.node === "published_netflix_agent"));
  const retrievalExecuted = publishedExecuted && turn.runtime.citations.length > 0;
  const retrievalDisplay = turn.runtime.mode === "fixture"
    ? { value: source, status: "Fixture replay" }
    : retrievalExecuted
      ? { value: "Published Netflix KB", status: "Runtime-proven" }
      : publishedExecuted
        ? { value: "KB source records", status: "Not captured" }
        : { value: "No KB retrieval", status: "Not executed" };
  const runtimeNodes: GraphNode[] = turn.runtime.nodeTrace?.map((entry) => ({ id: entry.node, label: entry.node.replaceAll("_", " "), role: `${entry.durationMs} ms`, state: entry.status === "complete" ? "complete" : entry.status === "blocked" ? "waiting" : "active", kind: nodeKind(entry.node) })) ?? [];
  const nodes = runtimeNodes.length ? runtimeNodes : item.graph;
  const responseEvidenceLabel = turn.runtime.mode === "fixture" ? "Fixture replay" : "Runtime-proven";
  const routeEvidenceLabel = turn.runtime.mode === "agentic" ? "Runtime-proven" : "Fixture replay";
  const qualityLabel = turn.runtime.quality?.status === "passed"
    ? "Passed · Runtime-proven"
    : turn.runtime.quality?.status === "failed"
      ? "Failed · answer preserved · Runtime-proven"
      : "Not evaluated";
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0]?.id ?? "");
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const nodeEvents = turn.runtime.protocolEvents?.filter((event) =>
    event.stepName === selectedNode?.id || event.subagentRunId && selectedNode?.id.includes("specialist"),
  ) ?? [];
  const agentCount = nodes.filter((node) => (node.kind ?? nodeKind(node.id)) === "agent").length;

  return (
    <section className="execution-visuals">
      <div className="run-summary">
        <div><span>Pattern</span><strong>{pattern}</strong></div>
        <div><span>Outcome</span><strong>{turn.runtime.error ? "Failed" : "Completed"}</strong></div>
        <div><span>Agent steps</span><strong>{agentCount}</strong></div>
        <div><span>Citations</span><strong>{turn.runtime.citations.length}</strong></div>
        <div><span>Guardrail</span><strong>{turn.runtime.guardrail?.decision ?? "n/a"}</strong></div>
        <div><span>Latency</span><strong>{(turn.runtime.totalMs / 1000).toFixed(2)} s</strong></div>
      </div>
      <nav className="visual-tabs" aria-label="Run visualisations">
        <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>Execution graph</button>
        <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Run timeline</button>
        <button className={view === "evidence" ? "active" : ""} onClick={() => setView("evidence")}>Evidence flow</button>
      </nav>
      {view === "graph" && <div className="graph-inspector-layout">
        <PatternGraph nodes={nodes} pattern={pattern} selectedNode={selectedNodeId} onSelect={(node) => setSelectedNodeId(node.id)} />
        {selectedNode && <aside className="node-inspector">
          <p className="eyebrow">Selected execution node</p>
          <h4>{selectedNode.label}</h4>
          <div className="inspector-grid">
            <div><span>Type</span><strong>{nodeKindLabel[selectedNode.kind ?? nodeKind(selectedNode.id)]}</strong></div>
            <div><span>Status</span><strong>{selectedNode.state}</strong></div>
            <div><span>Duration</span><strong>{selectedNode.role}</strong></div>
            <div><span>Events</span><strong>{nodeEvents.length}</strong></div>
          </div>
          <p>{nodeEvents.length ? nodeEvents.map((event) => event.type).join(" → ") : "No node-specific protocol envelope was returned for this view."}</p>
          {selectedNode.id.includes("specialist") && turn.runtime.integrations?.a2a.executed && <div className="artifact-proof"><span>A2A task artifact</span><strong>{turn.runtime.integrations.a2a.specialists?.map((specialist) => specialist.agentName).join(" + ") || turn.runtime.integrations.a2a.agentName}</strong><small>Task {turn.runtime.integrations.a2a.taskId}</small></div>}
          {selectedNode.id === "published_netflix_agent" && <div className="artifact-proof"><span>Evidence consumed</span><strong>{turn.runtime.citations.length} returned citations</strong><small>Persora KB · Supabase/Postgres vectors</small></div>}
        </aside>}
      </div>}
      {view === "timeline" && <div className="visual-card timeline-card">
        <div className="card-heading"><div><span>{turn.runtime.mode === "agentic" ? "Runtime event sequence" : "Fixture event sequence"}</span><strong>Ordered run events</strong></div><p>{turn.runtime.mode === "agentic" ? "Node order and durations were returned by this server-side LangGraph run." : "Relative ordering is proven by the fixture; no synthetic latency is displayed."}</p></div>
        <div className="timeline-list">{nodes.map((node, index) => <div className="timeline-row" key={node.id}><span>0{index + 1}</span><strong>{node.label}</strong><div className="timeline-track"><i style={{ width: `${32 + index * 14}%` }} /></div><em>{turn.runtime.nodeTrace?.[index] ? `${turn.runtime.nodeTrace[index].durationMs} ms` : node.state}</em></div>)}</div>
      </div>}
      {view === "evidence" && <div className="visual-card evidence-flow-card">
        <div className="card-heading"><div><span>Evidence lineage</span><strong>Source to answer</strong></div><p>Every stage retains its evidence classification.</p></div>
        <div className="flow-line">
          <article><span>01</span><strong>{retrievalDisplay.value}</strong><small>{retrievalDisplay.status}</small></article><i>→</i>
          <article><span>02</span><strong>{pattern} route</strong><small>{routeEvidenceLabel}</small></article><i>→</i>
          <article><span>03</span><strong>Case response</strong><small>{responseEvidenceLabel}</small></article><i>→</i>
          <article><span>04</span><strong>Quality evaluation</strong><small>{turn.runtime.quality ? qualityLabel : turn.runtime.mode === "fixture" ? "Fixture replay" : "Not evaluated"}</small></article>
        </div>
        {turn.runtime.retrieval && <div className="retrieval-results">
          <div><span>Retrieval provider</span><strong>{turn.runtime.retrieval.provider}</strong><small>{turn.runtime.retrieval.returnedCount} ranked sources · retrieval-only latency not captured</small></div>
          {turn.runtime.retrieval.results.map((result) => <article key={`${result.rank}-${result.label}`}>
            <b>#{result.rank}</b><div><strong>{result.label}</strong>{result.snippet && <p>{result.snippet.slice(0, 180)}</p>}</div><em>{formatRetrievalScore(result.similarity)}</em>
          </article>)}
        </div>}
      </div>}
    </section>
  );
}

function LayerPanel({ layer }: { layer: EvidenceLayer }) {
  return (
    <div className="layer-panel">
      <div className="layer-summary">
        <p className="eyebrow">Selected run</p>
        <h3>{layer.title}</h3>
        <p>{layer.subtitle}</p>
      </div>
      <div className="evidence-list">
        {layer.fields.map((item) => (
          <article className="evidence-row" key={item.label}>
            <div className="evidence-name"><span>{item.label}</span><small>{item.detail}</small></div>
            <div className="evidence-value">
              {item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.value} ↗</a> : <strong>{item.value}</strong>}
              {item.metrics && <div className="metric-grid">{item.metrics.map((metric) => <div key={metric.label}><span>{metric.label}</span><b>{metric.value}</b></div>)}</div>}
              <em className={`status ${item.status}`}>{statusLabel[item.status]}</em>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function layersForTurn(turn: ChatTurn, langfuseOverride?: NonNullable<ChatTurn["runtime"]["integrations"]>["langfuse"]): EvidenceLayer[] {
  const item = turn.demoCase!;
  if (turn.runtime.mode === "fixture") return item.layers;

  const agentic = turn.runtime.mode === "agentic";
  const groupAggregation = agentic && (turn.runtime.pattern ?? item.pattern) === "group-chat";
  const publishedExecuted = !agentic || (!groupAggregation && Boolean(turn.runtime.nodeTrace?.some((entry) => entry.node === "published_netflix_agent")));
  const citationEvidenceReturned = turn.runtime.citations.length > 0;
  const langfuse = langfuseOverride ?? turn.runtime.integrations?.langfuse;
  const agUi = turn.runtime.integrations?.agUi;
  const a2a = turn.runtime.integrations?.a2a;
  const ragas = turn.runtime.integrations?.ragas;
  const handoff = turn.runtime.handoff;
  const quality = turn.runtime.quality;
  const orchestrationProof = turn.runtime.orchestrationProof;
  const executedSpecialists = turn.runtime.specialist
    ? [turn.runtime.specialist]
    : a2a?.specialists ?? [];
  const skipReason = turn.runtime.guardrail?.decision === "block"
    ? { value: "Blocked before model call", detail: "The authorization guardrail ended the graph before retrieval or model execution." }
    : handoff?.required
      ? { value: "Paused for human approval", detail: "The handoff route intentionally stops before retrieval or model execution." }
      : { value: "Not executed", detail: "No published-agent node was present in this run." };
  let patternProof: EvidenceLayer["fields"][number] = {
    label: "Pattern execution proof",
    value: "Not executed",
    status: "not-executed",
    detail: "Direct live mode does not claim that the demonstration's orchestration pattern ran.",
  };
  if (agentic && (turn.runtime.pattern ?? item.pattern) === "concurrent") {
    const proof = orchestrationProof?.concurrent;
    patternProof = {
      label: "Pattern execution proof",
      value: proof?.proved ? `${proof.checks.length} checks overlapped ${proof.overlapMs.toFixed(3)} ms` : "Concurrency not proved",
      status: proof?.proved ? "runtime-proven" : "not-captured",
      detail: proof?.proved ? "Independent policy and safe-alternative checks both started before either finished; timestamps come from this run." : "Both checks may have completed, but this run did not record positive execution overlap.",
      metrics: proof?.checks.map((check) => ({ label: check.name, value: `${check.durationMs.toFixed(3)} ms` })),
    };
  } else if (agentic && (turn.runtime.pattern ?? item.pattern) === "magentic") {
    const proof = orchestrationProof?.recovery;
    patternProof = {
      label: "Pattern execution proof",
      value: proof?.executed ? `${proof.iterations.length}/${proof.maxIterations} planner decisions · ${proof.revised ? "revised then finished" : "finished without revision"}` : "Planner proof missing",
      status: proof?.executed ? "runtime-proven" : "not-captured",
      detail: proof?.executed ? proof.iterations.map((iteration) => `Attempt ${iteration.attempt}: ${iteration.decision} — ${iteration.reason}`).join(" ") : "No bounded planner decisions were returned.",
    };
  } else if (agentic && (turn.runtime.pattern ?? item.pattern) === "group-chat") {
    patternProof = {
      label: "Pattern execution proof",
      value: a2a?.executed ? `A2A task ${a2a.taskId} completed before aggregation` : "A2A task not proved",
      status: a2a?.executed ? "runtime-proven" : "not-captured",
      detail: a2a?.executed ? "The node trace and A2A task artifact prove that distinct specialist results were gathered and aggregated; no separate synthesis-agent call is claimed." : a2a?.error ?? "No A2A task artifact was returned.",
    };
  } else if (agentic && (turn.runtime.pattern ?? item.pattern) === "handoff") {
    patternProof = {
      label: "Pattern execution proof",
      value: handoff?.required ? "Human interrupt emitted" : "Handoff not proved",
      status: handoff?.required ? "runtime-proven" : "not-captured",
      detail: handoff?.required ? "The run paused with a persisted, session-bound approval record before any account action." : "No human-approval interrupt was returned.",
    };
  } else if (agentic) {
    patternProof = {
      label: "Pattern execution proof",
      value: `${turn.runtime.nodeTrace?.length ?? 0} ordered nodes`,
      status: turn.runtime.nodeTrace?.length ? "runtime-proven" : "not-captured",
      detail: `Execution order: ${turn.runtime.nodeTrace?.map((entry) => entry.node).join(" → ") || "not captured"}.`,
    };
  }

  const replace = (id: EvidenceLayer["id"], fields: EvidenceLayer["fields"]): EvidenceLayer[] =>
    item.layers.map((layer) => layer.id === id ? { ...layer, fields } : layer);

  let next = replace("orchestration", [
    { label: agentic ? "Executed pattern" : "Demo pattern", value: turn.runtime.pattern ?? item.pattern, status: agentic ? "runtime-proven" : "fixture-replay", detail: agentic ? "Returned by the server-side LangGraph run for this request." : "The selected visual pattern remains an interview demonstration; it is not relabelled as the published agent's internal graph." },
    { label: "Why this route", value: turn.runtime.routing?.reason ?? "Not captured", status: turn.runtime.routing ? "runtime-proven" : "not-captured", detail: turn.runtime.routing ? `Transparent ${turn.runtime.routing.strategy}; signals: ${turn.runtime.routing.signals.join(", ")}; confidence ${(turn.runtime.routing.confidence * 100).toFixed(0)}%.` : "The runtime did not return a routing decision." },
    { label: "Executed specialist agents", value: executedSpecialists.length ? executedSpecialists.map((specialist) => specialist.agentName).join(" + ") : "Not captured", status: executedSpecialists.length ? "runtime-proven" : "not-captured", detail: executedSpecialists.length ? executedSpecialists.map((specialist) => `${specialist.domain}: agent ${specialist.agentId}, widget ${specialist.widgetId}`).join("; ") : "This run returned no specialist identity, so the UI does not infer one from the question." },
    patternProof,
    { label: groupAggregation ? "Final answer step" : "Published execution", value: groupAggregation ? "Specialist aggregation" : publishedExecuted ? "Persora orchestrate-chat" : skipReason.value, status: groupAggregation || publishedExecuted ? "runtime-proven" : "not-executed", detail: groupAggregation ? "The final answer is the validated aggregation of the three A2A specialist results; no fourth synthesis call executed." : publishedExecuted ? "This answer was received from the published agent endpoint." : skipReason.detail },
    { label: "LangGraph node trace", value: agentic ? `${turn.runtime.nodeTrace?.length ?? 0} completed nodes` : "Not executed", status: agentic ? "runtime-proven" : "not-executed", detail: agentic ? `Server runtime: ${turn.runtime.integrations?.langGraph.version ?? "version not returned"}.` : "A LangGraph server adapter has not supplied node events for this run." },
  ]);
  next = next.map((layer) => layer.id === "content" ? { ...layer, fields: [
    {
      label: "Knowledge source",
      value: citationEvidenceReturned ? "help.netflix.com Website Knowledge" : publishedExecuted ? "Source records not returned" : "Not queried",
      status: citationEvidenceReturned ? "runtime-proven" : publishedExecuted ? "not-captured" : "not-executed",
      detail: citationEvidenceReturned ? "This exact run returned source records with the answer." : publishedExecuted ? "The published-agent call completed, but this run returned no citation record proving retrieval." : skipReason.detail,
    },
    { label: "Returned citations", value: `${turn.runtime.citations.length}`, status: "runtime-proven", detail: "Counted from citation events in this answer's stream." },
    { label: "Vector store", value: "Supabase/Postgres vector retrieval", status: "repo-defined", detail: "The inspected Persora implementation calls search_kb_chunks; this browser run does not expose the SQL payload." },
    { label: "Neo4j / GraphRAG", value: "Not executed", status: "not-executed", detail: "No graph database event was present in this run." },
  ] } : layer);
  next = next.map((layer) => layer.id === "interaction" ? { ...layer, fields: [
    { label: "Customer surface", value: "Support chatbot", status: "runtime-proven", detail: "The submitted question and returned answer are visible in this UI." },
    { label: "AG-UI event stream", value: agUi?.executed ? `${agUi.eventCount} events · v${agUi.version}` : "Not executed", status: agUi?.executed ? "runtime-proven" : "not-executed", detail: agUi?.executed ? `Observed over SSE: ${turn.runtime.eventTypes.join(", ")}.` : "The published-agent stream is not relabelled as AG-UI without AG-UI lifecycle envelopes." },
    { label: "A2A specialist exchange", value: a2a?.executed ? `${a2a.agentName} · task ${a2a.taskId}` : a2a?.error ? `Failed: ${a2a.error}` : "Not required for this route", status: a2a?.executed ? "runtime-proven" : "not-executed", detail: a2a?.executed ? `Agent Card discovery and message:send completed using A2A ${a2a.version}; ${a2a.specialists?.length ?? 0} published specialist agent${a2a.specialists?.length === 1 ? "" : "s"} returned task evidence.` : "A2A is invoked only by the group-chat route; absence on other routes is expected." },
    { label: "Human handoff", value: handoff?.status === "awaiting-human" ? "Awaiting demo-operator decision" : handoff?.status === "approved" ? "Approved — safe continuation recorded" : handoff?.status === "rejected" ? "Rejected — workflow closed" : "Not required for this route", status: handoff?.required ? "runtime-proven" : "not-executed", detail: handoff?.decisionMessage ?? handoff?.summary ?? "No approval interrupt was emitted for this answer." },
  ] } : layer);
  next = next.map((layer) => layer.id === "observability" ? { ...layer, fields: [
    { label: "Trace identifier", value: turn.runtime.traceId, status: "runtime-proven", detail: "Generated for this request and sent as x-trace-id." },
    { label: "Public trace projection", value: turn.runtime.publicTrace ? `${turn.runtime.publicTrace.nodeCount} nodes · ${turn.runtime.publicTrace.protocolEventCount} events` : "Not captured", status: turn.runtime.publicTrace ? "runtime-proven" : "not-captured", detail: turn.runtime.publicTrace ? `Sanitized trace schema ${turn.runtime.publicTrace.schemaVersion}; ${turn.runtime.publicTrace.citationCount} citations. The private Langfuse console and credentials are never exposed.` : "No sanitized trace projection was returned." },
    { label: "End-to-end latency", value: `${turn.runtime.totalMs} ms`, status: "runtime-proven", detail: "Measured in the browser from request start through stream completion." },
    { label: "Prompt version", value: turn.runtime.promptVersion ?? "Not captured", status: turn.runtime.promptVersion ? "runtime-proven" : "not-captured", detail: "Version returned by the server execution contract." },
    { label: "Private Langfuse mirror", value: langfuse?.readback === "available" ? `${langfuse.observations.length} sanitized observations` : langfuse?.readback === "failed" ? "Read-back failed" : langfuse?.executed ? "Export accepted · read-back pending" : langfuse?.configured ? "Export failed" : "Not configured", status: langfuse?.readback === "available" || (langfuse?.executed && langfuse?.readback !== "failed") ? "runtime-proven" : "not-executed", detail: langfuse?.readback === "available" ? "The server read this run back from the private Langfuse project and returned only an allow-listed projection—never credentials, inputs, outputs, user/session IDs or private console links." : langfuse?.readback === "failed" ? langfuse.error ?? "The private observation read-back failed." : langfuse?.executed ? "Langfuse accepted the export, but its observation API has not made the new records available yet." : langfuse?.error ?? "Server-side Langfuse credentials are absent; no trace is claimed.", metrics: langfuse?.readback === "available" ? langfuse.observations.map((observation) => ({ label: `${observation.type} · ${observation.name}`, value: [observation.durationMs === null ? null : `${observation.durationMs} ms`, observation.status].filter(Boolean).join(" · ") || "Observed" })) : undefined },
  ] } : layer);
  return next.map((layer) => layer.id === "quality" ? { ...layer, fields: [
    { label: "Answer present", value: turn.answer.trim() ? "Passed" : "Failed", status: "runtime-proven", detail: "Programmatic validation checked that the live stream produced answer text." },
    { label: "Exact-run quality evaluation", value: quality?.status === "passed" ? "Passed" : quality?.status === "failed" ? "Failed — answer preserved" : "Not evaluated", status: quality?.executed ? "runtime-proven" : "not-evaluated", detail: quality?.reason ?? "This path did not generate a published knowledge answer, so grounding and relevance were not evaluated.", metrics: quality?.executed ? [
      { label: "Grounding", value: `${((quality.grounding ?? 0) * 100).toFixed(1)}%` },
      { label: "Citation validity", value: `${((quality.citationValidity ?? 0) * 100).toFixed(1)}%` },
      { label: "Answer relevance", value: `${((quality.answerRelevance ?? 0) * 100).toFixed(1)}%` },
      ...(quality.intentCoverage === null ? [] : [{ label: "Intent coverage", value: `${(quality.intentCoverage * 100).toFixed(1)}% (${quality.coveredIntentCount}/${quality.requiredIntentCount})` }]),
      { label: "Supported claims", value: `${quality.supportedClaimCount}/${quality.claimCount}` },
    ] : undefined },
    { label: "Live exact-run RAG evaluation", value: ragas?.executed ? `${ragas.status} · ${ragas.durationMs ?? 0} ms` : "Not evaluated", status: ragas?.executed ? "runtime-proven" : "not-evaluated", detail: ragas?.executed ? `${ragas.implementation}; model ${ragas.evaluatorModel}; evaluator ${ragas.evaluatorVersion}. Exact input hashes: question ${ragas.inputHashes?.question.slice(0, 10)}, answer ${ragas.inputHashes?.answer.slice(0, 10)}, contexts ${ragas.inputHashes?.contexts.slice(0, 10)}.` : ragas?.error ?? "The exact-run evaluator did not execute.", metrics: ragas?.metrics ? Object.entries(ragas.metrics).map(([name, score]) => ({
      label: name.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase()),
      value: score === null ? "Not applicable" : `${(score * 100).toFixed(1)}%`,
    })) : undefined },
    { label: "Unsupported claims", value: ragas?.executed ? `${ragas.unsupportedClaims.length}` : "Not evaluated", status: ragas?.executed ? "runtime-proven" : "not-evaluated", detail: ragas?.unsupportedClaims.length ? ragas.unsupportedClaims.join(" · ") : ragas?.executed ? "The evaluator returned no unsupported factual claim." : "No evaluator result was returned." },
    { label: "Reference-dependent correctness", value: ragas?.metrics.factualCorrectness === null || ragas?.metrics.factualCorrectness === undefined ? "Not applicable" : `${(ragas.metrics.factualCorrectness * 100).toFixed(1)}%`, status: ragas?.metrics.factualCorrectness === null || ragas?.metrics.factualCorrectness === undefined ? "not-evaluated" : "runtime-proven", detail: ragas?.referenceId ? `Compared this exact answer with trusted reference ${ragas.referenceId}.` : "This was a new/free-form question with no approved reference. Faithfulness and relevancy still executed; correctness was not invented." },
    { label: "Authorization guardrail", value: turn.runtime.guardrail ? `${turn.runtime.guardrail.decision}: ${turn.runtime.guardrail.reason}` : "Not captured", status: turn.runtime.guardrail ? "runtime-proven" : "not-captured", detail: "A deterministic server-side decision runs before retrieval." },
    { label: "Python RAGAS release benchmark", value: "CI only", status: "repo-defined", detail: "The pinned Python RAGAS suite remains release evidence and is never substituted into this live run." },
  ] } : layer);
}

function ExplainDrawer({ turn, onClose, onHandoffDecision }: { turn: ChatTurn; onClose: () => void; onHandoffDecision: (decision: "approve" | "reject") => Promise<void> }) {
  const item = turn.demoCase!;
  const runId = turn.runId!;
  const [langfuseMirror, setLangfuseMirror] = useState(turn.runtime.integrations?.langfuse);
  const evidenceLayers = useMemo(() => layersForTurn(turn, langfuseMirror), [turn, langfuseMirror]);
  useEffect(() => {
    const traceId = turn.runtime.integrations?.langfuse.traceId;
    const readbackToken = turn.runtime.integrations?.langfuse.readbackToken;
    if (!traceId || !readbackToken || turn.runtime.integrations?.langfuse.readback === "available") return;
    let cancelled = false;
    void (async () => {
      for (const delayMs of [1_000, 3_000, 5_000, 8_000]) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        if (cancelled) return;
        try {
          const result = await readLangfuseMirror(traceId, readbackToken);
          if (cancelled) return;
          setLangfuseMirror(result);
          if (result.readback === "available") return;
        } catch (error) {
          if (!cancelled) setLangfuseMirror((current) => current ? { ...current, readback: "failed", error: error instanceof Error ? error.message : "Langfuse read-back failed" } : current);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [turn]);
  const [activeLayer, setActiveLayer] = useState(evidenceLayers[0].id);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const layer = evidenceLayers.find((candidate) => candidate.id === activeLayer) ?? evidenceLayers[0];
  const proofCounts = useMemo(() => {
    const fields = evidenceLayers.flatMap((entry) => entry.fields);
    return {
      proven: fields.filter((entry) => entry.status === "runtime-proven" || entry.status === "repo-defined").length,
      fixture: fields.filter((entry) => entry.status === "fixture-replay").length,
      absent: fields.filter((entry) => entry.status === "not-captured" || entry.status === "not-executed" || entry.status === "not-evaluated").length,
    };
  }, [evidenceLayers]);

  const decide = async (decision: "approve" | "reject") => {
    setDeciding(true);
    setDecisionError(null);
    try {
      await onHandoffDecision(decision);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "The decision could not be recorded.");
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer-header">
          <div><p className="eyebrow">Answer explanation · case-specific execution</p><h2 id="drawer-title">See how this answer was produced</h2></div>
          <button className="close" onClick={onClose}>Close ×</button>
        </header>

        <div className="drawer-scroll">
          <section className="run-hero">
            <div><span className="run-chip">RUN · {runId}</span><h3>{item.summary}</h3></div>
            <div className="proof-meter">
              <div><strong>{proofCounts.proven}</strong><span>proven</span></div>
              <div><strong>{proofCounts.fixture}</strong><span>fixture</span></div>
              <div><strong>{proofCounts.absent}</strong><span>not run</span></div>
            </div>
          </section>

          <ExecutionVisuals turn={turn} />

          {turn.runtime.handoff?.status === "awaiting-human" && turn.runtime.handoff.approvalId && <section className="approval-card">
            <div><p className="eyebrow">Human-in-the-loop checkpoint</p><h3>Decide the demo workflow</h3><p>{turn.runtime.handoff.summary}</p><small>This records an orchestration decision only. It does not cancel a Netflix account or issue a refund.</small>{decisionError && <p className="approval-error" role="alert">{decisionError}</p>}</div>
            <div className="approval-actions"><button disabled={deciding} onClick={() => void decide("reject")}>Reject</button><button className="approve" disabled={deciding} onClick={() => void decide("approve")}>{deciding ? "Recording…" : "Approve safe continuation"}</button></div>
          </section>}

          <section className="architecture">
            <div className="section-title"><div><p className="eyebrow">Architecture evidence</p><h3>Five layers, one selected run</h3></div><p>Click a layer to inspect its actual values and evidence status.</p></div>
            <nav className="layer-tabs" aria-label="Evidence layers">
              {evidenceLayers.map((candidate) => (
                <button className={activeLayer === candidate.id ? "active" : ""} key={candidate.id} onClick={() => setActiveLayer(candidate.id)}>
                  <span>{candidate.index}</span><strong>{candidate.title}</strong><small>{candidate.subtitle.split(" · ")[0]}</small>
                </button>
              ))}
            </nav>
            <LayerPanel layer={layer} />
          </section>

          <section className="stack-map">
            <div><p className="eyebrow">Transferable stack map</p><h3>Technology proof for this selected run</h3></div>
            <div className="stack-grid">
              <article><span>Foundation</span><strong>Typed run evidence, deterministic fixtures, React UI</strong><small>Implemented here</small></article>
              <article><span>Orchestration</span><strong>LangGraph {turn.runtime.integrations?.langGraph.version ?? ""}</strong><small>{turn.runtime.integrations?.langGraph.executed ? "Executed for this run" : "Not executed"}</small></article>
              <article><span>Content & data</span><strong>Persora KB · Supabase vectors · citations</strong><small>{turn.runtime.citations.length ? `${turn.runtime.citations.length} sources returned` : "No sources returned"}; Neo4j not run</small></article>
              <article><span>Interaction</span><strong>AG-UI {turn.runtime.integrations?.agUi.executed ? "executed" : "not run"} · A2A {turn.runtime.integrations?.a2a.executed ? "executed" : "route-dependent"}</strong><small>Handoff state: {turn.runtime.handoff?.status ?? "not captured"}</small></article>
              <article><span>Observability & quality</span><strong>Langfuse {turn.runtime.integrations?.langfuse.executed ? "executed" : "not run"} · live evaluation {turn.runtime.integrations?.ragas.executed ? "executed" : "not run"}</strong><small>Exact-run metrics and the CI-only Python RAGAS benchmark remain separate</small></article>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function routeFixtureQuestion(question: string): DemoCase | null {
  const selected = selectOrchestrationPattern(question).pattern;
  if (selected === "sequential" && !/\b(travel|travelling|household|stream|watch|tv)\b/i.test(question)) return null;
  return cases.find((item) => item.pattern === selected) ?? null;
}

export default function App() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [selectedTurn, setSelectedTurn] = useState<ChatTurn | null>(null);
  const [source, setSource] = useState<AnswerSource>("agentic");
  const [progress, setProgress] = useState<RunProgress | null>(null);

  const resetConversation = () => {
    setTurns([]);
    setSelectedTurn(null);
    setProgress(null);
  };

  const ask = async (question: string, selectedCase?: DemoCase) => {
    const demoCase = selectedCase ?? routeFixtureQuestion(question);
    const sequence = turns.length + 1;
    const started = performance.now();
    let answer = demoCase?.answer ?? "This evidence fixture does not have a supported route for that question yet. Try one of the five conversation starters. I will not invent an answer or a runtime trace.";
    let runtime: ChatTurn["runtime"] = {
      mode: "fixture",
      transport: "local",
      traceId: `fixture-${sequence}`,
      totalMs: 0,
      eventTypes: ["fixture-selected", "answer-rendered"],
      citations: [],
      error: null,
    };

    if (source !== "fixture") {
      try {
        setProgress(source === "agentic" ? { traceId: "starting", stage: "intake", label: "Starting the LangGraph run", status: "running", startedAt: performance.now(), events: [] } : null);
        const live = source === "agentic" ? await askAgenticDemo(question, setProgress) : await askPublishedAgent(question);
        answer = live.answer;
        runtime = live.runtime;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown live-agent error.";
        answer = `The published agent could not be reached from this origin, so no live answer is shown. ${message}`;
        runtime = {
          mode: source,
          transport: "sse",
          traceId: crypto.randomUUID(),
          totalMs: Math.round(performance.now() - started),
          eventTypes: ["request-failed"],
          citations: [],
          error: message,
        };
      }
    }
    setProgress(null);

    const resolvedDemoCase = demoCase ?? (runtime.mode === "agentic" ? cases.find((item) => item.pattern === runtime.pattern) ?? cases[0] : null);
    const turn: ChatTurn = {
      id: `turn-${sequence}`,
      question,
      answer,
      runId: runtime.traceId,
      createdAt: new Date().toISOString(),
      demoCase: resolvedDemoCase,
      runtime,
    };
    setTurns((current) => [...current, turn]);
  };

  const decideHandoff = async (decision: "approve" | "reject") => {
    if (!selectedTurn?.runtime.handoff?.approvalId) return;
    const continuation = await resolveAgenticHandoff(selectedTurn.runtime.handoff.approvalId, decision);
    const updated: ChatTurn = {
      ...selectedTurn,
      runtime: {
        ...selectedTurn.runtime,
        totalMs: selectedTurn.runtime.totalMs + continuation.runtime.totalMs,
        eventTypes: [...new Set([...selectedTurn.runtime.eventTypes, ...continuation.runtime.eventTypes])],
        protocolEvents: [...(selectedTurn.runtime.protocolEvents ?? []), ...(continuation.runtime.protocolEvents ?? [])],
        nodeTrace: [...(selectedTurn.runtime.nodeTrace ?? []), ...(continuation.runtime.nodeTrace ?? [])],
        handoff: continuation.runtime.handoff,
      },
    };
    setTurns((current) => current.map((turn) => turn.id === updated.id ? updated : turn));
    setSelectedTurn(updated);
  };

  return (
    <div className="app">
      <Header />
      <Conversation turns={turns} onAsk={ask} onExplain={setSelectedTurn} onReset={resetConversation} source={source} onSourceChange={setSource} progress={progress} />
      {selectedTurn?.demoCase && selectedTurn.runId && <ExplainDrawer key={`${selectedTurn.id}-${selectedTurn.runtime.handoff?.status ?? "none"}`} turn={selectedTurn} onClose={() => setSelectedTurn(null)} onHandoffDecision={decideHandoff} />}
    </div>
  );
}
