import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cases } from "./data";
import { askAgenticDemo, askPublishedAgent, resolveAgenticHandoff } from "./liveClient";
import { formatRetrievalScore } from "./retrievalScore";
import type { ChatTurn, DemoCase, EvidenceLayer, EvidenceStatus, GraphNode, Pattern, RunProgress } from "./types";

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
  "group-chat": "A coordinator obtains one A2A specialist task result before grounded synthesis.",
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

function Conversation({ turns, onAsk, onExplain, source, onSourceChange, progress }: {
  turns: ChatTurn[];
  onAsk: (question: string, selectedCase?: DemoCase) => Promise<void>;
  onExplain: (turn: ChatTurn) => void;
  source: AnswerSource;
  onSourceChange: (value: AnswerSource) => void;
  progress: RunProgress | null;
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
                {turn.runtime.followUps && turn.runtime.followUps.length > 0 && <div className="follow-ups">
                  <strong>Continue this conversation</strong>
                  <div>{turn.runtime.followUps.map((question) => <button key={question} disabled={submitting} onClick={() => void onAsk(question)}>{question}<span>↗</span></button>)}</div>
                </div>}
              </div>
            </div>
          ))
        )}
        {submitting && progress && <div className="live-progress" role="status">
          <div className="progress-pulse"><i /></div>
          <div><span>LIVE ORCHESTRATION</span><strong>{progress.label}</strong><small>{progress.events.length} protocol events received · trace {progress.traceId.slice(0, 8)}</small></div>
        </div>}
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

const nodeKind = (id: string): NonNullable<GraphNode["kind"]> => {
  if (/published_netflix_agent|group_a2a_specialist|specialist|synthesis/.test(id)) return "agent";
  if (/knowledge|retrieval|kb/.test(id)) return "knowledge";
  if (/human|handoff|approval|decision/.test(id)) return "human";
  if (/validation|quality/.test(id)) return "quality";
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
  const runtimeNodes: GraphNode[] = turn.runtime.nodeTrace?.map((entry) => ({ id: entry.node, label: entry.node.replaceAll("_", " "), role: `${entry.durationMs} ms`, state: entry.status === "complete" ? "complete" : entry.status === "blocked" ? "waiting" : "active", kind: nodeKind(entry.node) })) ?? [];
  const nodes = runtimeNodes.length ? runtimeNodes : item.graph;
  const evidenceLabel = turn.runtime.mode === "agentic" ? "Runtime-proven" : "Fixture replay";
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
        <div><span>Agents</span><strong>{agentCount}</strong></div>
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
          {selectedNode.id.includes("specialist") && turn.runtime.integrations?.a2a.executed && <div className="artifact-proof"><span>A2A task artifact</span><strong>{turn.runtime.integrations.a2a.agentName}</strong><small>Task {turn.runtime.integrations.a2a.taskId}</small></div>}
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
          <article><span>01</span><strong>{turn.runtime.mode === "agentic" ? "Published Netflix KB" : source}</strong><small>{evidenceLabel}</small></article><i>→</i>
          <article><span>02</span><strong>{pattern} route</strong><small>{evidenceLabel}</small></article><i>→</i>
          <article><span>03</span><strong>Case response</strong><small>{evidenceLabel}</small></article><i>→</i>
          <article><span>04</span><strong>Required-field check</strong><small>Runtime-proven</small></article>
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

function layersForTurn(turn: ChatTurn): EvidenceLayer[] {
  const item = turn.demoCase!;
  if (turn.runtime.mode === "fixture") return item.layers;

  const agentic = turn.runtime.mode === "agentic";
  const publishedExecuted = !agentic || Boolean(turn.runtime.nodeTrace?.some((entry) => entry.node === "published_netflix_agent"));
  const langfuse = turn.runtime.integrations?.langfuse;
  const agUi = turn.runtime.integrations?.agUi;
  const a2a = turn.runtime.integrations?.a2a;
  const ragas = turn.runtime.integrations?.ragas;
  const handoff = turn.runtime.handoff;

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
    { label: "AG-UI event stream", value: agUi?.executed ? `${agUi.eventCount} events · v${agUi.version}` : "Not executed", status: agUi?.executed ? "runtime-proven" : "not-executed", detail: agUi?.executed ? `Observed over SSE: ${turn.runtime.eventTypes.join(", ")}.` : "The published-agent stream is not relabelled as AG-UI without AG-UI lifecycle envelopes." },
    { label: "A2A specialist exchange", value: a2a?.executed ? `${a2a.agentName} · task ${a2a.taskId}` : a2a?.error ? `Failed: ${a2a.error}` : "Not required for this route", status: a2a?.executed ? "runtime-proven" : "not-executed", detail: a2a?.executed ? `One Agent Card discovery and one message:send completed using A2A ${a2a.version}; no additional specialists are claimed.` : "A2A is invoked only by the group-chat route; absence on other routes is expected." },
    { label: "Human handoff", value: handoff?.status === "awaiting-human" ? "Awaiting demo-operator decision" : handoff?.status === "approved" ? "Approved — safe continuation recorded" : handoff?.status === "rejected" ? "Rejected — workflow closed" : "Not required for this route", status: handoff?.required ? "runtime-proven" : "not-executed", detail: handoff?.decisionMessage ?? handoff?.summary ?? "No approval interrupt was emitted for this answer." },
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
    { label: "RAGAS benchmark", value: ragas?.executed ? "CI benchmark completed" : "Not executed", status: ragas?.executed ? "runtime-proven" : "not-executed", detail: ragas?.executed ? `Pinned RAGAS ${ragas.version} evaluated the checked-in deterministic benchmark. These are suite-level metrics, not a score for this answer.` : "No metric is displayed without an evaluator run.", metrics: ragas?.executed ? [
      { label: "Benchmark cases", value: String(ragas.sampleCount ?? 0) },
      { label: "Response similarity", value: `${((ragas.scores?.non_llm_string_similarity ?? 0) * 100).toFixed(2)}%` },
      { label: "Required-phrase coverage", value: `${((ragas.scores?.required_phrase_presence ?? 0) * 100).toFixed(0)}%` },
    ] : undefined },
  ] } : layer);
}

function ExplainDrawer({ turn, onClose, onHandoffDecision }: { turn: ChatTurn; onClose: () => void; onHandoffDecision: (decision: "approve" | "reject") => Promise<void> }) {
  const item = turn.demoCase!;
  const runId = turn.runId!;
  const evidenceLayers = useMemo(() => layersForTurn(turn), [turn]);
  const [activeLayer, setActiveLayer] = useState(evidenceLayers[0].id);
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const layer = evidenceLayers.find((candidate) => candidate.id === activeLayer) ?? evidenceLayers[0];
  const proofCounts = useMemo(() => {
    const fields = evidenceLayers.flatMap((entry) => entry.fields);
    return {
      proven: fields.filter((entry) => entry.status === "runtime-proven" || entry.status === "repo-defined").length,
      fixture: fields.filter((entry) => entry.status === "fixture-replay").length,
      absent: fields.filter((entry) => entry.status === "not-captured" || entry.status === "not-executed").length,
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
              <article><span>Observability & quality</span><strong>Langfuse {turn.runtime.integrations?.langfuse.executed ? "executed" : "not run"} · RAGAS {turn.runtime.integrations?.ragas.executed ? "benchmark executed" : "not run"}</strong><small>Per-run and benchmark evidence remain explicitly separate</small></article>
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
  const [progress, setProgress] = useState<RunProgress | null>(null);

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
      runId: resolvedDemoCase ? `${runtime.mode === "agentic" ? "agentic" : runtime.mode === "live" ? "live" : "fx"}-${resolvedDemoCase.id}-${String(sequence).padStart(3, "0")}` : null,
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
      <Header source={source} onSourceChange={setSource} />
      <Conversation turns={turns} onAsk={ask} onExplain={setSelectedTurn} source={source} onSourceChange={setSource} progress={progress} />
      {selectedTurn?.demoCase && selectedTurn.runId && <ExplainDrawer key={`${selectedTurn.id}-${selectedTurn.runtime.handoff?.status ?? "none"}`} turn={selectedTurn} onClose={() => setSelectedTurn(null)} onHandoffDecision={decideHandoff} />}
    </div>
  );
}
