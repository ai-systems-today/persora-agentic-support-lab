import { useMemo, useState } from "react";
import { cases } from "./data";
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

function Header() {
  return (
    <header className="app-header">
      <div className="brand-mark">P</div>
      <div className="brand-copy">
        <strong>Persora</strong>
        <span>Netflix Support · Agentic Evidence Lab</span>
      </div>
      <div className="mode"><i /> Evidence mode · fixture replay</div>
    </header>
  );
}

function Conversation({ turns, onAsk, onExplain }: {
  turns: ChatTurn[];
  onAsk: (question: string, selectedCase?: DemoCase) => void;
  onExplain: (turn: ChatTurn) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const question = draft.trim();
    if (!question) return;
    onAsk(question);
    setDraft("");
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
            <button className="starter" key={item.id} onClick={() => onAsk(item.customer, item)}>
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
            <p>Every submitted answer receives an independent fixture run.</p>
          </div>
        ) : (
          turns.map((turn) => (
            <div className="turn" key={turn.id}>
              <div className="message customer"><span>You</span><p>{turn.question}</p></div>
              <div className="message assistant">
                <span>Persora</span>
                <p>{turn.answer}</p>
                <div className="answer-footer">
                  <div><i /> {turn.runId ?? "No run"} · {turn.demoCase?.pattern ?? "unsupported"}</div>
                  {turn.demoCase && <button onClick={() => onExplain(turn)}>Explain this answer <b>↗</b></button>}
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      <form className="composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <input aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a Netflix support question…" />
        <button aria-label="Send" title="Send question">↑</button>
      </form>
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

function ExecutionVisuals({ item }: { item: DemoCase }) {
  const [view, setView] = useState<"graph" | "timeline" | "evidence">("graph");
  const source = item.layers.find((layer) => layer.id === "content")?.fields[0]?.value ?? "Fixture source";

  return (
    <section className="execution-visuals">
      <nav className="visual-tabs" aria-label="Run visualisations">
        <button className={view === "graph" ? "active" : ""} onClick={() => setView("graph")}>Execution graph</button>
        <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Run timeline</button>
        <button className={view === "evidence" ? "active" : ""} onClick={() => setView("evidence")}>Evidence flow</button>
      </nav>
      {view === "graph" && <PatternGraph nodes={item.graph} pattern={item.pattern} />}
      {view === "timeline" && <div className="visual-card timeline-card">
        <div className="card-heading"><div><span>Fixture event sequence</span><strong>Ordered run events</strong></div><p>Relative ordering is proven by the fixture; no synthetic latency is displayed.</p></div>
        <div className="timeline-list">{item.graph.map((node, index) => <div className="timeline-row" key={node.id}><span>0{index + 1}</span><strong>{node.label}</strong><div className="timeline-track"><i style={{ width: `${32 + index * 14}%` }} /></div><em>{node.state}</em></div>)}</div>
      </div>}
      {view === "evidence" && <div className="visual-card evidence-flow-card">
        <div className="card-heading"><div><span>Evidence lineage</span><strong>Source to answer</strong></div><p>Every stage retains its evidence classification.</p></div>
        <div className="flow-line">
          <article><span>01</span><strong>{source}</strong><small>Fixture replay</small></article><i>→</i>
          <article><span>02</span><strong>{item.pattern} route</strong><small>Fixture replay</small></article><i>→</i>
          <article><span>03</span><strong>Case response</strong><small>Fixture replay</small></article><i>→</i>
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
            <div className="evidence-value"><strong>{item.value}</strong><em className={`status ${item.status}`}>{statusLabel[item.status]}</em></div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ExplainDrawer({ item, runId, onClose }: { item: DemoCase; runId: string; onClose: () => void }) {
  const [activeLayer, setActiveLayer] = useState(item.layers[0].id);
  const layer = item.layers.find((candidate) => candidate.id === activeLayer) ?? item.layers[0];
  const proofCounts = useMemo(() => {
    const fields = item.layers.flatMap((entry) => entry.fields);
    return {
      proven: fields.filter((entry) => entry.status === "runtime-proven" || entry.status === "repo-defined").length,
      fixture: fields.filter((entry) => entry.status === "fixture-replay").length,
      absent: fields.filter((entry) => entry.status === "not-captured" || entry.status === "not-executed").length,
    };
  }, [item]);

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

          <ExecutionVisuals item={item} />

          <section className="architecture">
            <div className="section-title"><div><p className="eyebrow">Architecture evidence</p><h3>Five layers, one selected run</h3></div><p>Click a layer to inspect its actual values and evidence status.</p></div>
            <nav className="layer-tabs" aria-label="Evidence layers">
              {item.layers.map((candidate) => (
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

  const ask = (question: string, selectedCase?: DemoCase) => {
    const demoCase = selectedCase ?? routeFixtureQuestion(question);
    const sequence = turns.length + 1;
    const turn: ChatTurn = {
      id: `turn-${sequence}`,
      question,
      answer: demoCase?.answer ?? "This evidence fixture does not have a supported route for that question yet. Try one of the five conversation starters. I will not invent an answer or a runtime trace.",
      runId: demoCase ? `fx-${demoCase.id}-${String(sequence).padStart(3, "0")}` : null,
      createdAt: new Date().toISOString(),
      demoCase,
    };
    setTurns((current) => [...current, turn]);
  };

  return (
    <div className="app">
      <Header />
      <Conversation turns={turns} onAsk={ask} onExplain={setSelectedTurn} />
      {selectedTurn?.demoCase && selectedTurn.runId && <ExplainDrawer key={selectedTurn.id} item={selectedTurn.demoCase} runId={selectedTurn.runId} onClose={() => setSelectedTurn(null)} />}
    </div>
  );
}
