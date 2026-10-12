import { useEffect, useState } from "react";
import { comparisonWarnings, latencySummary, type BenchmarkReport, type Metric } from "../supabase/functions/_shared/evaluationReport";
import "./testResults.css";

const display = (m: Metric) => m.value === null ? m.status.replaceAll("-", " ") : m.unit === "ratio" ? `${(m.value * 100).toFixed(1)}%` : `${m.value.toFixed(m.unit === "USD" ? 4 : 0)} ${m.unit}`;

function validateReport(value: unknown): BenchmarkReport {
  const r = value as BenchmarkReport;
  if (!r || r.schemaVersion !== "1.0" || !Array.isArray(r.cases) || typeof r.runId !== "string" || !["fresh-application", "contract-fixture"].includes(r.scope)) throw new Error("Unsupported test report format");
  for (const c of r.cases) {
    if (!Array.isArray(c.metrics) || !Array.isArray(c.sources) || !Array.isArray(c.failures) || !Array.isArray(c.expectedFacts) || c.expectedFacts.some(f => typeof f !== "string") || typeof c.question !== "string" || typeof c.answer !== "string") throw new Error("Invalid case record");
    if (c.evidence && (!Array.isArray(c.evidence.contexts) || !c.evidence.decision || !c.evidence.versions)) throw new Error("Invalid evidence snapshot");
    for (const m of c.metrics) if (typeof m.name !== "string" || !["ratio", "ms", "count", "USD"].includes(m.unit) || (m.value !== null && (typeof m.value !== "number" || !Number.isFinite(m.value) || m.value < 0 || (m.unit === "ratio" && m.value > 1)))) throw new Error("Invalid metric value");
  }
  return r;
}

export default function TestResultsPage() {
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [baseline, setBaseline] = useState<BenchmarkReport | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [savedRuns, setSavedRuns] = useState<Array<{ file: string; label: string }>>([]);
  const loadSaved = async (file: string) => {
    try {
      if (!/^[a-zA-Z0-9_-]+\.json$/.test(file)) throw new Error("Invalid saved report path");
      const response = await fetch(`${import.meta.env.BASE_URL}evaluation/${file}`);
      if (!response.ok) throw new Error("Saved report unavailable");
      setReport(validateReport(await response.json())); setSelected(0); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load saved run"); }
  };
  useEffect(() => {
    void fetch(`${import.meta.env.BASE_URL}evaluation/index.json`).then(r => r.ok ? r.json() : []).then((items: unknown) => {
      if (Array.isArray(items)) setSavedRuns(items.filter(i => i && typeof i.file === "string" && typeof i.label === "string"));
    }).catch(() => setSavedRuns([]));
  }, []);
  const load = async (file: File | undefined, isBaseline = false) => {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Report exceeds 10 MB");
      const data = validateReport(JSON.parse(await file.text()));
      if (isBaseline) setBaseline(data); else { setReport(data); setSelected(0); }
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load report"); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "persora-test-results.json"; a.click(); URL.revokeObjectURL(url);
  };
  const times = latencySummary(report?.cases.map(c => c.metrics.find(m => m.name === "total_answer_ms")?.value ?? null) ?? []);
  const active = report?.cases[selected];
  const previous = baseline?.cases.find(c => c.caseId === active?.caseId);
  const warnings = report && baseline ? comparisonWarnings(report, baseline) : [];
  return <main className="test-results">
    <div className="test-heading"><div><span>Persora evaluation</span><h1>Test Results</h1><p>Inspect fresh chatbot test runs. Running a test does not publish a release.</p></div>
      <div className="test-import">{savedRuns.length > 0 && <label>Saved public test runs<select defaultValue="" onChange={e => void loadSaved(e.target.value)}><option value="" disabled>Select a run</option>{savedRuns.map(r => <option key={r.file} value={r.file}>{r.label}</option>)}</select></label>}<label>Load test report<input type="file" accept=".json" onChange={e => void load(e.target.files?.[0])} /></label><label>Load baseline<input type="file" accept=".json" onChange={e => void load(e.target.files?.[0], true)} /></label>{report && <button onClick={download}>Download report</button>}</div></div>
    {error && <p role="alert" className="test-alert">{error}</p>}
    {!report ? <section className="test-empty"><h2>No test run loaded</h2><p>Load the JSON report produced by the fresh-answer benchmark runner. Your file stays in this browser; loading it sends no data to Langfuse or another server.</p><p>The existing five saved-answer fixtures are not fresh application results. Missing measurements remain visible as not evaluated.</p><p>Langfuse retains its separate private dashboard. This public view does not expose private console URLs or credentials.</p></section> : <>
      <div className="test-meta"><strong>{report.status}</strong><span>{report.createdAt}</span><span>{report.scope}</span><span>Dataset: {report.datasetVersion}</span><span>Sources: {report.sourceVersion}</span><span>Application: {report.applicationVersion}</span><span>Evaluator: {report.evaluatorVersion}</span></div>
      {[...(report.comparisonWarnings ?? []), ...warnings].map(w => <p className="test-alert" key={w}>{w}</p>)}
      {!!report.gateFailures?.length && <details className="test-alert"><summary>Release gates: {report.gateFailures.length} unresolved checks</summary><ul>{report.gateFailures.map((f, i) => <li key={i}>{f}</li>)}</ul></details>}
      <section className="test-summary">
        <article><span>Cases</span><strong>{report.cases.length}</strong><small>{report.cases.filter(c => c.status === "failed").length} failed · {report.cases.filter(c => c.status === "not-evaluated").length} not evaluated</small></article>
        <article><span>Median answer time</span><strong>{times.median === null ? "Not captured" : `${Math.round(times.median)} ms`}</strong><small>{times.count} measured samples</small></article>
        <article><span>p95 answer time</span><strong>{times.p95 === null ? "Insufficient samples" : `${Math.round(times.p95)} ms`}</strong><small>{times.reason}</small></article>
        <article><span>Reviewed expectations</span><strong>{report.cases.filter(c => c.reviewStatus === "approved").length}/{report.cases.length}</strong><small>Source review and human judge calibration are separate</small></article>
      </section>
      <div className="test-layout"><section className="test-case-list"><h2>Questions</h2>{report.cases.map((c, i) => <button key={c.caseId} className={selected === i ? "selected" : ""} onClick={() => setSelected(i)}><strong>{c.question}</strong><span>{c.status} · {c.category}</span></button>)}</section>
      {active && <section className="test-case-detail"><h2>{active.question}</h2><p>Run: {active.runId || "Not captured"} · Review: {active.reviewStatus} · {active.reviewKind ?? "Method not recorded"} · {active.reviewer ?? "Reviewer not recorded"}</p>
        <h3>Actual answer</h3><p className="test-answer">{active.answer || "No answer returned"}</p>
        {active.evidence?.draftAnswer !== active.answer && active.evidence && <details><summary>Original draft and response decision</summary><p>{active.evidence.decision.action}: {active.evidence.decision.reason}</p><p className="test-answer">{active.evidence.draftAnswer}</p></details>}
        <h3>Expected facts or behaviour</h3><ul>{active.expectedFacts.map(f => <li key={f}>{f}</li>)}</ul>
        {active.failures.length > 0 && <><h3>Failures</h3><ul>{active.failures.map(f => <li key={f}>{f}</li>)}</ul></>}
        <h3>Metrics and baseline comparison</h3><div className="test-table-wrap"><table><thead><tr><th>Metric</th><th>Current</th><th>Baseline</th><th>Reason / method</th></tr></thead><tbody>{active.metrics.map(m => {
          const old = previous?.metrics.find(x => x.name === m.name);
          return <tr key={m.name}><td>{m.name.replaceAll("_", " ")}{m.unit === "ratio" && m.value !== null && <><div className="metric-bar" aria-hidden="true"><i style={{ width: `${m.value * 100}%` }} /></div>{old?.value != null && <div className="metric-bar baseline-bar" aria-hidden="true"><i style={{ width: `${old.value * 100}%` }} /></div>}</>}</td><td>{display(m)}</td><td>{old ? display(old) : "—"}</td><td>{m.reason}<small>{m.method}</small></td></tr>;
        })}</tbody></table></div>
        <h3>Captured sources</h3>{active.sources.map((s, i) => <details key={i}><summary>{s.label}</summary>{s.url && /^https:\/\/help\.netflix\.com\//.test(s.url) && <a href={s.url} target="_blank" rel="noreferrer">Open official source</a>}<p>{s.text || "Source passage not included in this report"}</p></details>)}
        <h3>Langfuse</h3><p>{active.langfuseExported ? "Trace export was accepted. Inspect the matching request in your private Langfuse dashboard." : "Trace export unavailable or suppressed for this run."} Private console links are kept out of public reports.</p>
      </section>}</div>
    </>}
  </main>;
}
