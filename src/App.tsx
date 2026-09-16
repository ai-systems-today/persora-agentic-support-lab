import { useMemo, useState } from "react";
import { cases } from "./data";
import type { DemoCase, EvidenceLayer, EvidenceStatus, GraphNode, Pattern } from "./types";

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

function Conversation({ selected, onSelect, onExplain }: {
  selected: DemoCase | null;
  onSelect: (item: DemoCase) => void;
  onExplain: () => void;
}) {
  return (
    <main className="chat-shell">
      <section className="intro">
        <div className="assistant-avatar">N</div>
        <p className="eyebrow">Netflix support demonstration</p>
        <h1>Ask naturally. Inspect exactly what happened.</h1>
        <p className="lede">Four cases demonstrate grounding, access control, approval and recovery. Every explanation distinguishes visible runtime proof from fixture data and integrations that did not run.</p>
      </section>

      <section className="starters" aria-label="Conversation starters">
        <div className="section-label">Conversation starters</div>
        <div className="starter-grid">
          {cases.map((item, index) => (
            <button className={selected?.id === item.id ? "starter active" : "starter"} key={item.id} onClick={() => onSelect(item)}>
              <span>0{index + 1}</span>
              <strong>{item.starter}</strong>
              <small>{item.pattern}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="conversation" aria-live="polite">
        {!selected ? (
          <div className="empty-state">
            <div className="empty-orbit"><span /></div>
            <strong>Select a starter to run a deterministic demo case.</strong>
            <p>No provider key is required in fixture mode.</p>
          </div>
        ) : (
          <>
            <div className="message customer"><span>You</span><p>{selected.customer}</p></div>
            <div className="message assistant">
              <span>Persora</span>
              <p>{selected.answer}</p>
              <div className="answer-footer">
                <div><i /> Fixture response · {selected.pattern}</div>
                <button onClick={onExplain}>Explain this answer <b>↗</b></button>
              </div>
            </div>
          </>
        )}
      </section>

      <form className="composer" onSubmit={(event) => event.preventDefault()}>
        <input aria-label="Message" placeholder="Ask a Netflix support question…" />
        <button aria-label="Send" title="Fixture mode uses the starters">↑</button>
      </form>
    </main>
  );
}

function PatternGraph({ nodes, pattern }: { nodes: GraphNode[]; pattern: Pattern }) {
  return (
    <div className="graph-card">
      <div className="card-heading">
        <div><span>Execution graph</span><strong>{pattern}</strong></div>
        <p>{patternDescription[pattern]}</p>
      </div>
      <div className={`graph pattern-${pattern}`}>
        {nodes.map((node, index) => (
          <div className="graph-unit" key={node.id}>
            <div className={`graph-node ${node.state}`}>
              <span>{index + 1}</span>
              <strong>{node.label}</strong>
              <small>{node.role}</small>
            </div>
            {index < nodes.length - 1 && <div className="connector"><i /></div>}
          </div>
        ))}
      </div>
      <div className="legend">
        <span><i className="complete" /> complete</span>
        <span><i className="active" /> active</span>
        <span><i className="waiting" /> waiting</span>
      </div>
    </div>
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

function ExplainDrawer({ item, onClose }: { item: DemoCase; onClose: () => void }) {
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
            <div><span className="run-chip">CASE · {item.id}</span><h3>{item.summary}</h3></div>
            <div className="proof-meter">
              <div><strong>{proofCounts.proven}</strong><span>proven</span></div>
              <div><strong>{proofCounts.fixture}</strong><span>fixture</span></div>
              <div><strong>{proofCounts.absent}</strong><span>not run</span></div>
            </div>
          </section>

          <PatternGraph nodes={item.graph} pattern={item.pattern} />

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

export default function App() {
  const [selected, setSelected] = useState<DemoCase | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  return (
    <div className="app">
      <Header />
      <Conversation selected={selected} onSelect={(item) => { setSelected(item); setExplainOpen(false); }} onExplain={() => setExplainOpen(true)} />
      {selected && explainOpen && <ExplainDrawer key={selected.id} item={selected} onClose={() => setExplainOpen(false)} />}
    </div>
  );
}

