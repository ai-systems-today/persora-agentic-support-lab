import { useState } from "react";
import { askHybridRag, type HybridBackend, type HybridEvidence, type HybridResult } from "./hybridRagClient";
import RelationshipGraph from "./RelationshipGraph";
import "./hybridRag.css";

const labels: Record<HybridBackend, { eyebrow: string; title: string; description: string }> = {
  "azure-openai": { eyebrow: "AZURE OPENAI", title: "Query embedding", description: "Creates the 1,536-dimensional query vector." },
  pinecone: { eyebrow: "VECTOR RETRIEVAL", title: "Pinecone", description: "Returns ranked Netflix knowledge chunks." },
  neo4j: { eyebrow: "GRAPH ENRICHMENT", title: "Neo4j Aura", description: "Returns bounded topic relationships with provenance." },
};

const evidenceFor = (result: HybridResult | null, backend: HybridBackend): HybridEvidence | null =>
  result?.evidence.find((item) => item.backend === backend) ?? null;

export default function HybridRagPage() {
  const [question, setQuestion] = useState("How does Netflix Household work while travelling?");
  const [result, setResult] = useState<HybridResult | null>(null);
  const [selected, setSelected] = useState<HybridBackend>("azure-openai");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const value = question.trim();
    if (!value || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    const started = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - started), 100);
    try {
      setResult(await askHybridRag(value));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hybrid retrieval failed.");
    } finally {
      window.clearInterval(timer);
      setElapsed(performance.now() - started);
      setLoading(false);
    }
  };

  const selectedEvidence = evidenceFor(result, selected);
  const backends: HybridBackend[] = ["azure-openai", "pinecone", "neo4j"];

  return (
    <main className="hybrid-page">
      <section className="hybrid-hero">
        <div><p className="eyebrow">Hybrid retrieval demonstration</p><h1>Pinecone + Neo4j, with exact-run proof</h1><p>Ask a Netflix support question. A service is marked runtime-proven only when that backend returns evidence for this request.</p></div>
        <div className="hybrid-run-status"><i className={loading ? "running" : result ? "complete" : ""} /><strong>{loading ? "Running" : result ? "Run complete" : "Ready"}</strong><span>{result ? `${result.runId.slice(0, 8)} · ${(result.totalMs / 1000).toFixed(1)}s` : loading ? `${(elapsed / 1000).toFixed(1)}s` : "No run yet"}</span></div>
      </section>

      <section className="hybrid-query">
        <label htmlFor="hybrid-question">Netflix knowledge question</label>
        <div><input id="hybrid-question" value={question} disabled={loading} maxLength={1000} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void run(); }} /><button type="button" disabled={loading || !question.trim()} onClick={() => void run()}>{loading ? <span className="typing-dots"><i /><i /><i /></span> : "Run hybrid search"}</button></div>
        {error && <p className="hybrid-error" role="alert">{error} No fixture evidence was substituted.</p>}
        {result?.error && <p className="hybrid-error" role="alert">{result.error} No fixture evidence was substituted.</p>}
      </section>

      <section className="cloud-execution" aria-label="Cloud execution evidence">
        <header><div><p className="eyebrow">Cloud execution</p><h2>Live request path</h2></div><div className="cloud-legend"><span><i className="proved" />Runtime-proven</span><span><i />Not executed</span></div></header>
        <div className="cloud-flow">
          <article className="cloud-node edge"><span>SUPABASE EDGE</span><strong>Hybrid RAG API</strong><p>Validation, rate limit and evidence envelope</p><em className={result ? "runtime-proven" : "not-executed"}>{result ? "Runtime-proven" : "Not executed"}</em></article>
          <b>→</b>
          {backends.map((backend, index) => {
            const evidence = evidenceFor(result, backend);
            const meta = labels[backend];
            return <div className="cloud-step" key={backend}>{index > 0 && <b>→</b>}<button className={selected === backend ? "selected" : ""} type="button" onClick={() => setSelected(backend)}><span>{meta.eyebrow}</span><strong>{meta.title}</strong><p>{meta.description}</p><em className={evidence?.executed ? "runtime-proven" : "not-executed"}>{evidence?.executed ? "Runtime-proven" : "Not executed"}</em></button></div>;
          })}
        </div>
        <div className="cloud-inspector"><div><span>{labels[selected].title}</span><strong>{selectedEvidence?.executed ? `${selectedEvidence.records} records returned` : selectedEvidence?.error ?? "Run a query to capture evidence."}</strong></div><div><span>Duration</span><strong>{selectedEvidence ? `${selectedEvidence.durationMs} ms` : "Not captured"}</strong></div><div><span>Status</span><strong>{selectedEvidence?.executed ? "Exact-run evidence" : "Not executed"}</strong></div></div>
      </section>

      {result && <section className="hybrid-results">
        <div className="hybrid-result-column"><header><div><p className="eyebrow">Pinecone evidence</p><h2>Ranked knowledge chunks</h2></div><span>{result.vectorMatches.length} returned</span></header>{result.vectorMatches.length ? result.vectorMatches.map((match, index) => <article key={match.id}><b>{index + 1}</b><div><strong>{match.title ?? "Netflix Help article"}</strong><p>{match.content.slice(0, 240)}{match.content.length > 240 ? "…" : ""}</p>{match.sourceUrl && <a href={match.sourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a>}</div><em>{match.score.toFixed(3)}</em></article>) : <p className="hybrid-empty">No vector records returned.</p>}</div>
        <div className="hybrid-result-column"><header><div><p className="eyebrow">Neo4j evidence</p><h2>Graph relationships</h2></div><span>{result.graphFacts.length} returned</span></header>{result.graphFacts.length ? result.graphFacts.map((fact, index) => <article className="graph-fact" key={`${fact.from}-${fact.relationship}-${fact.to}-${index}`}><div><strong>{fact.from}</strong><span>{fact.relationship.replaceAll("_", " ")}</span><strong>{fact.to}</strong></div><small>{fact.sourceChunkIds.length} source chunks · {fact.sourceUrls.length} source URLs</small></article>) : <p className="hybrid-empty">No bounded graph relationship matched this run.</p>}</div>
      </section>}
      {result && <RelationshipGraph key={result.runId} facts={result.graphFacts} />}
    </main>
  );
}
