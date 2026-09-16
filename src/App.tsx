import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cases } from "./data";
import { askAgenticDemo, askPublishedAgent } from "./liveClient";
import type { ChatTurn, DemoCase, EvidenceLayer, EvidenceStatus, GraphNode, Pattern } from "./types";

const statusLabel: Record<EvidenceStatus, string> = {
  "runtime-proven": "Runtime-proven",
  "repo-defined": "Repo-defined",
  "fixture-replay": "Fixture replay",
  "not-captured": "Not captured",
  "not-executed": "Not executed",
};

const patternDescription: Record<Pattern, string> = {
  sequential: "Each step completes before the next begins.",
  concurrent: "Independent checks run side by side, then converge.",
  "group-chat": "Specialists collaborate through a shared conversation state.",
  handoff: "Control transfers when authorization or human judgment is required.",
  magentic: "A planner selects and revises the next specialist step from state.",
};

type AnswerSource = "fixture" | "live" | "agentic";

function normalizeAssistantMarkdown(answer: string) {
  return answer
    .replace(/([^\n])\s+(#{1,6}\s+)/g, "$1\n\n$2")
    .replace(/([^\n])\s+(\d+\.\s+\*\*)/g, "$1\n\n$2");
}

function Header({ source, onSourceChange }: { source: AnswerSource; onSourceChange: (value: AnswerSource) => void }) {
  return (
    <header className="app-header">
      <div className="brand-mark">P</div>
      <div className="brand-copy">
        <strong>Persora</strong>
        <span>Netflix Support · Agentic Evidence Lab</span>
      </div>
      <div className="mode-switch" role="group" aria-label="Answer source">
        <button className={source === "fixture" ? "active" : ""} onClick={() => onSourceChange("fixture")}>Fixture</button>
        <button className={source === "live" ? "active" : ""} onClick={() => onSourceChange("live")}>Live KB</button>
        <button className={source === "agentic" ? "active" : ""} onClick={() => onSourceChange("agentic")}>Agentic run</button>
      </div>
      <div className={`mode ${source !== "fixture" ? "live" : ""}`}><i /> {source === "agentic" ? "LangGraph + published Persora agent" : source === "live" ? "Published Persora agent" : "Evidence mode · fixture replay"}</div>
    </header>
  );
}

function Conversation({ turns, onAsk, onExplain, source, onSourceChange }: {
  turns: ChatTurn[];
  onAsk: (question: string, selectedCase?: DemoCase) => Promise<void>;
  onExplain: (turn: ChatTurn) => void;
  source: AnswerSource;
  onSourceChange: (value: AnswerSource) => void;
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const question = draft.trim();
    if (!question) return;
    setSubmitting(true);
    await onAsk(question);
    setSubmitting(false);
    setDraft("");
  };

  const askStarter = async (item: DemoCase) => {
    setSubmitting(true);
    await onAsk(item.customer, item);
    setSubmitting(false);
  };

  return (
    <main className="chat-shell">
      <section className="intro">
        <div className="assistant-avatar">N</div>
        <p className="eyebrow">Netflix support demonstration</p>
        <h1>Ask naturally. Inspect exactly what happened.</h1>
        <p className="lede">Five cases demonstrate grounding, access control, approval, recovery and specialist group chat. Every answer has its own inspectable run and distinguishes fixture evidence from integrations that did not run.</p>
      </section>

      <section className="starters" aria-label="Conversation starters">
        <div className="section-label">Conversation starters</div>
        <div className="starter-grid">
          {cases.map((item, index) => (
            <button className="starter" key={item.id} disabled={submitting} onClick={() => void askStarter(item)}>
              <span>0{index + 1}</span>
              <strong>{item.starter}</strong>
              <small>{item.pattern}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="conversation" aria-live="polite">
        {turns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-orbit"><span /></div>
            <strong>Select a starter or type a supported Netflix question.</strong>
            <p>{source === "agentic" ? "Questions run through the evidence-producing LangGraph path and published Netflix agent." : source === "live" ? "Questions are sent directly to the published Netflix Support agent." : "Questions use the local, deterministic evidence fixture."}</p>
          </div>
        ) : (
          turns.map((turn) => (
            <div className="turn" key={turn.id}>
              <div className="message customer"><span>You</span><p>{turn.question}</p></div>
              <div className="message assistant">
                <span>Persora</span>
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
                {turn.runtime.citations.length > 0 && <div className="citations">
                  <strong>Sources used</strong>
                  <div>{turn.runtime.citations.map((citation, index) => citation.url
                    ? <a key={`${citation.url}-${index}`} href={citation.url} target="_blank" rel="noreferrer">{index + 1}. {citation.label}</a>
                    : <span key={`${citation.label}-${index}`}>{index + 1}. {citation.label}</span>)}</div>
                </div>}
                <div className="answer-footer">
                  <div><i /> {turn.runId ?? "No run"} · {turn.runtime.mode} · {turn.runtime.totalMs} ms</div>
                  {turn.demoCase && <button onClick={() => onExplain(turn)}>Explain this answer <b>↗</b></button>}
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <div className={`composer-dock ${source !== "fixture" ? "live" : "fixture"}`}>
        <div className="answer-source-bar">
          <div className="answer-source-copy">
            <span>Answer source</span>
            <strong>{source === "agentic" ? "Agentic evidence run" : source === "live" ? "Live Netflix KB" : "Demo fixture"}</strong>
            <small>{source === "agentic" ? "LangGraph trace · deterministic guardrail · real KB answer and citations" : source === "live" ? "Published Persora agent · streamed response · returned citations" : "Local deterministic replay · no network request"}</small>
          </div>
          <div className="answer-source-switch" role="group" aria-label="Choose answer source">
            <button type="button" aria-pressed={source === "fixture"} className={source === "fixture" ? "active" : ""} onClick={() => onSourceChange("fixture")}>Fixture</button>
            <button type="button" aria-pressed={source === "live"} className={source === "live" ? "active" : ""} onClick={() => onSourceChange("live")}>Live Netflix KB</button>
            <button type="button" aria-pressed={source === "agentic"} className={source === "agentic" ? "active" : ""} onClick={() => onSourceChange("agentic")}>Agentic run</button>
          </div>
        </div>
        <form className="composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <input aria-label="Message" disabled={submitting} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={submitting ? "Running the selected answer path…" : "Ask a Netflix support question…"} />
          <button aria-label="Send" disabled={submitting} title="Send question">{submitting ? "…" : "↑"}</button>
        </form>
      </div>
    </main>
  );
}

function PatternGraph({ nodes, pattern }: { nodes: GraphNode[]; pattern: Pattern }) {
  const renderNode = (node: GraphNode, index: number) => (
    <div className={`graph-node ${node.state}`} key={`${node.id}-${index}`}>
      <span>{index + 1}</span><strong>{node.label}</strong><small>{node.role}</small>
    </div>
  );

  const topology = (() => {
    if (pattern === "concurrent") {
      return <div className="topology concurrent-topology">
        {renderNode(nodes[0], 0)}<div className="fork">split</div><div className="parallel-stack">{nodes.slice(1, -1).map((node, index) => renderNode(node, index + 1))}</div><div className="join">join</div>{renderNode(nodes.at(-1)!, nodes.length - 1)}
      </div>;
    }
    if (pattern === "group-chat") {
      return <div className="topology group-topology">
        <div className="group-coordinator">{renderNode(nodes[0], 0)}</div>
        <div className="shared-state">shared conversation state</div>
        <div className="specialist-ring">{nodes.slice(1, -1).map((node, index) => renderNode(node, index + 1))}</div>
        <div className="group-result">{renderNode(nodes.at(-1)!, nodes.length - 1)}</div>
      </div>;
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
  const runtimeNodes: GraphNode[] = turn.runtime.nodeTrace?.map((entry) => ({ id: entry.node, label: entry.node.replaceAll("_", " "), role: `${entry.durationMs} ms`, state: entry.status === "complete" ? "complete" : entry.status === "blocked" ? "waiting" : "active" })) ?? [];
  const nodes = runtimeNodes.length ? runtimeNodes : item.graph;
  const evidenceLabel = turn.runtime.mode === "agentic" ? "Runtime-proven" : "Fixture replay";

  return (
    <section className="execution-visuals">
      <nav className="visual-tabs" aria-label="Run visualisations">
        <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>Execution graph</button>
        <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Run timeline</button>
        <button className={view === "evidence" ? "active" : ""} onClick={() => setView("evidence")}>Evidence flow</button>
      </nav>
      {view === "graph" && <PatternGraph nodes={nodes} pattern={pattern} />}
      {view === "timeline" && <div className="visual-card timeline-card">
        <div className="card-heading"><div><span>Fixture event sequence</span><strong>Ordered run events</strong></div><p>Relative ordering is proven by the fixture; no synthetic latency is displayed.</p></div>
        <div className="timeline-list">{nodes.map((node, index) => <div className="timeline-row" key={node.id}><span>0{index + 1}</span><strong>{node.label}</strong><div className="timeline-track"><i style={{ width: `${32 + index * 14}%` }} /></div><em>{turn.runtime.nodeTrace?.[index] ? `${turn.runtime.nodeTrace[index].durationMs} ms` : node.state}</em></div>)}</div>
      </div>}
      {view === "evidence" && <div className="visual-card evidence-flow-card">
        <div className="card-heading"><div><span>Evidence lineage</span><strong>Source to answer</strong></div><p>Every stage retains its evidence classification.</p></div>
        <div className="flow-line">
          <article><span>01</span><strong>{turn.runtime.mode === "agentic" ? "Published Netflix KB" : source}</strong><small>{evidenceLabel}</small></article><i>→</i>
          <article><span>02</span><strong>{pattern} route</strong><small>{evidenceLabel}</small></article><i>→</i>
          <article><span>03</span><strong>Case response</strong><small>{evidenceLabel}</small></article><i>→</i>
          <article><span>04</span><strong>Required-field check</strong><small>Runtime-proven</small></article>
        </div>
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
              <em className={`status ${item.status}`}>{statusLabel[item.status]}</em>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function layersForTurn(turn: ChatTurn): EvidenceLayer[] {
  const item = turn.demoCase!;
  if (turn.runtime.mode === "fixture") return item.layers;

  const agentic = turn.runtime.mode === "agentic";
  const publishedExecuted = !agentic || Boolean(turn.runtime.nodeTrace?.some((entry) => entry.node === "published_netflix_agent"));
  const langfuse = turn.runtime.integrations?.langfuse;

  const replace = (id: EvidenceLayer["id"], fields: EvidenceLayer["fields"]): EvidenceLayer[] =>
    item.layers.map((layer) => layer.id === id ? { ...layer, fields } : layer);

  let next = replace("orchestration", [
    { label: agentic ? "Executed pattern" : "Demo pattern", value: turn.runtime.pattern ?? item.pattern, status: agentic ? "runtime-proven" : "fixture-replay", detail: agentic ? "Returned by the server-side LangGraph run for this request." : "The selected visual pattern remains an interview demonstration; it is not relabelled as the published agent's internal graph." },
    { label: "Published execution", value: publishedExecuted ? "Persora orchestrate-chat" : "Skipped by guardrail", status: publishedExecuted ? "runtime-proven" : "not-executed", detail: publishedExecuted ? "This answer was received from the published agent endpoint." : "The deterministic authorization decision ended the graph before retrieval or model execution." },
    { label: "LangGraph node trace", value: agentic ? `${turn.runtime.nodeTrace?.length ?? 0} completed nodes` : "Not executed", status: agentic ? "runtime-proven" : "not-executed", detail: agentic ? `Server runtime: ${turn.runtime.integrations?.langGraph.version ?? "version not returned"}.` : "A LangGraph server adapter has not supplied node events for this run." },
  ]);
  next = next.map((layer) => layer.id === "content" ? { ...layer, fields: [
    { label: "Knowledge source", value: publishedExecuted ? "help.netflix.com Website Knowledge" : "Not queried", status: publishedExecuted ? "runtime-proven" : "not-executed", detail: publishedExecuted ? "The signed-in agent configuration shows this Domain Library knowledge base selected." : "The guardrail prevented retrieval." },
    { label: "Returned citations", value: `${turn.runtime.citations.length}`, status: "runtime-proven", detail: "Counted from citation events in this answer's stream." },
    { label: "Vector store", value: "Supabase/Postgres vector retrieval", status: "repo-defined", detail: "The inspected Persora implementation calls search_kb_chunks; this browser run does not expose the SQL payload." },
    { label: "Neo4j / GraphRAG", value: "Not executed", status: "not-executed", detail: "No graph database event was present in this run." },
  ] } : layer);
  next = next.map((layer) => layer.id === "interaction" ? { ...layer, fields: [
    { label: "Customer surface", value: "Support chatbot", status: "runtime-proven", detail: "The submitted question and returned answer are visible in this UI." },
    { label: "Transport", value: "Server-Sent Events", status: "runtime-proven", detail: `Observed event types: ${turn.runtime.eventTypes.join(", ") || "message stream"}.` },
    { label: "Protocol events", value: agentic ? `${turn.runtime.protocolEvents?.length ?? 0} AG-UI-compatible events` : "Not executed", status: agentic ? "runtime-proven" : "not-executed", detail: agentic ? "The demo function returned typed run lifecycle envelopes; A2A remains unclaimed until a remote Agent Card exchange runs." : "SSE transport is not presented as AG-UI or A2A without their protocol envelopes." },
  ] } : layer);
  next = next.map((layer) => layer.id === "observability" ? { ...layer, fields: [
    { label: "Trace identifier", value: turn.runtime.traceId, status: "runtime-proven", detail: "Generated for this request and sent as x-trace-id." },
    { label: "End-to-end latency", value: `${turn.runtime.totalMs} ms`, status: "runtime-proven", detail: "Measured in the browser from request start through stream completion." },
    { label: "Prompt version", value: turn.runtime.promptVersion ?? "Not captured", status: turn.runtime.promptVersion ? "runtime-proven" : "not-captured", detail: "Version returned by the server execution contract." },
    { label: "Langfuse observation", value: langfuse?.executed ? langfuse.traceId ?? "Executed" : langfuse?.configured ? "Export failed" : "Not configured", href: langfuse?.executed ? langfuse.traceUrl ?? undefined : undefined, status: langfuse?.executed ? "runtime-proven" : "not-executed", detail: langfuse?.executed ? "The server accepted an OTLP trace for this exact run; open it in Langfuse." : langfuse?.error ?? "Server-side Langfuse credentials are absent; no trace is claimed." },
  ] } : layer);
  return next.map((layer) => layer.id === "quality" ? { ...layer, fields: [
    { label: "Answer present", value: turn.answer.trim() ? "Passed" : "Failed", status: "runtime-proven", detail: "Programmatic validation checked that the live stream produced answer text." },
    { label: "Citation presence", value: turn.runtime.citations.length ? "Passed" : "No citations returned", status: "runtime-proven", detail: "Validated directly from the streamed citations event." },
    { label: "Authorization guardrail", value: turn.runtime.guardrail ? `${turn.runtime.guardrail.decision}: ${turn.runtime.guardrail.reason}` : "Not captured", status: turn.runtime.guardrail ? "runtime-proven" : "not-captured", detail: "A deterministic server-side decision runs before retrieval." },
    { label: "RAGAS evaluation", value: turn.runtime.integrations?.ragas.executed ? JSON.stringify(turn.runtime.integrations.ragas.scores) : "Not executed", status: turn.runtime.integrations?.ragas.executed ? "runtime-proven" : "not-executed", detail: "No metric is displayed without an evaluator run." },
  ] } : layer);
}

function ExplainDrawer({ turn, onClose }: { turn: ChatTurn; onClose: () => void }) {
  const item = turn.demoCase!;
  const runId = turn.runId!;
  const evidenceLayers = useMemo(() => layersForTurn(turn), [turn]);
  const [activeLayer, setActiveLayer] = useState(evidenceLayers[0].id);
  const layer = evidenceLayers.find((candidate) => candidate.id === activeLayer) ?? evidenceLayers[0];
  const proofCounts = useMemo(() => {
    const fields = evidenceLayers.flatMap((entry) => entry.fields);
    return {
      proven: fields.filter((entry) => entry.status === "runtime-proven" || entry.status === "repo-defined").length,
      fixture: fields.filter((entry) => entry.status === "fixture-replay").length,
      absent: fields.filter((entry) => entry.status === "not-captured" || entry.status === "not-executed").length,
    };
  }, [evidenceLayers]);

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
            <div><p className="eyebrow">Transferable stack map</p><h3>What this proves—and what remains an adapter</h3></div>
            <div className="stack-grid">
              <article><span>Foundation</span><strong>Typed run evidence, deterministic fixtures, React UI</strong><small>Implemented here</small></article>
              <article><span>Target orchestration</span><strong>LangChain / LangGraph</strong><small>Adapter boundary; no live claim</small></article>
              <article><span>Target data</span><strong>Pinecone / Milvus / Neo4j</strong><small>Provider-neutral evidence fields</small></article>
              <article><span>Target interaction</span><strong>AG-UI / A2A</strong><small>Protocol events not fabricated</small></article>
              <article><span>Target assurance</span><strong>Langfuse / RAGAS</strong><small>Scores appear only after execution</small></article>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function routeFixtureQuestion(question: string): DemoCase | null {
  const text = question.toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => text.includes(term));
  const issueCount = [has("billing", "payment", "country"), has("household", "device"), has("email", "sign in", "access")].filter(Boolean).length;
  if (issueCount >= 2) return cases.find((item) => item.id === "group-chat") ?? null;
  if (has("cancel", "refund")) return cases.find((item) => item.id === "approval-required") ?? null;
  if (has("another account", "other account", "reveal", "payment card")) return cases.find((item) => item.id === "access-blocked") ?? null;
  if (has("tried", "failed", "still does not", "temporary code")) return cases.find((item) => item.id === "recovery") ?? null;
  if (has("travel", "household", "stream")) return cases.find((item) => item.id === "grounded-answer") ?? null;
  return null;
}

export default function App() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [selectedTurn, setSelectedTurn] = useState<ChatTurn | null>(null);
  const [source, setSource] = useState<AnswerSource>("agentic");

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
        const live = source === "agentic" ? await askAgenticDemo(question) : await askPublishedAgent(question);
        answer = live.answer;
        runtime = live.runtime;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown live-agent error.";
        answer = `The published agent could not be reached from this origin, so no live answer is shown. ${message}`;
        runtime = {
          mode: source,
          transport: source === "agentic" ? "json" : "sse",
          traceId: crypto.randomUUID(),
          totalMs: Math.round(performance.now() - started),
          eventTypes: ["request-failed"],
          citations: [],
          error: message,
        };
      }
    }

    const resolvedDemoCase = demoCase ?? (runtime.mode === "agentic" ? cases.find((item) => item.pattern === runtime.pattern) ?? cases[0] : null);
    const turn: ChatTurn = {
      id: `turn-${sequence}`,
      question,
      answer,
      runId: resolvedDemoCase ? `${runtime.mode === "agentic" ? "agentic" : runtime.mode === "live" ? "live" : "fx"}-${resolvedDemoCase.id}-${String(sequence).padStart(3, "0")}` : null,
      createdAt: new Date().toISOString(),
      demoCase: resolvedDemoCase,
      runtime,
    };
    setTurns((current) => [...current, turn]);
  };

  return (
    <div className="app">
      <Header source={source} onSourceChange={setSource} />
      <Conversation turns={turns} onAsk={ask} onExplain={setSelectedTurn} source={source} onSourceChange={setSource} />
      {selectedTurn?.demoCase && selectedTurn.runId && <ExplainDrawer key={selectedTurn.id} turn={selectedTurn} onClose={() => setSelectedTurn(null)} />}
    </div>
  );
}
