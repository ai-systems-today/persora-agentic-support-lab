import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { evaluateCase, applyGates } from './benchmark_core.mjs';
import { readBenchmarkResponse } from './benchmark_transport.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = new URL('../', import.meta.url);
const dataset = JSON.parse(await readFile(new URL(option('--dataset', 'evaluation/dataset.json'), root), 'utf8'));
const gates = JSON.parse(await readFile(new URL('evaluation/gates.json', root), 'utf8'));
const endpoint = option('--endpoint', process.env.BENCHMARK_ENDPOINT);
if (!endpoint) throw new Error('Set BENCHMARK_ENDPOINT to the candidate agentic-support-demo endpoint');
const parsedUrl = new URL(endpoint);
if (!['https:', 'http:'].includes(parsedUrl.protocol) || (parsedUrl.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsedUrl.hostname))) throw new Error('HTTPS required except local test servers');
const output = new URL(option('--output', 'work/benchmark-report.json'), root);
let revision;
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(); } catch { revision = 'unknown'; }
const key = createHash('sha256').update(JSON.stringify({ dataset, gates, endpoint, revision })).digest('hex');
let report = { schemaVersion: '1.0', runId: randomUUID(), createdAt: new Date().toISOString(), datasetVersion: dataset.version,
  sourceVersion: dataset.sourceVersion, applicationVersion: option('--application-version', 'unknown'), evaluatorVersion: 'unknown', scope: 'fresh-application', runnerRevision: revision,
  status: 'running', cases: [], comparisonWarnings: [], resumeKey: key, endpointOrigin: parsedUrl.origin, publicSyntheticInput: dataset.publicSyntheticInput === true };
if (args.includes('--resume')) {
  report = JSON.parse(await readFile(output, 'utf8'));
  if (report.resumeKey !== key) throw new Error('Dataset/config/endpoint/revision differs; start a new report');
}
const save = async () => { await mkdir(new URL('./', output), { recursive: true }); await writeFile(new URL(output.href + '.tmp'), JSON.stringify(report, null, 2) + '\n'); await rename(new URL(output.href + '.tmp'), output); };
await save();
const limit = Number(option('--limit', dataset.cases.length));
const maxRequests = Number(option('--max-requests', dataset.cases.length));
let requests = 0;
for (const test of dataset.cases.slice(0, limit)) {
  if (report.cases.some(c => c.caseId === test.id)) continue;
  if (requests >= maxRequests) { report.comparisonWarnings.push('Configured request budget reached'); break; }
  requests++;
  const started = performance.now();
  const startedAt = new Date().toISOString();
  let payload;
  try {
    const headers = { 'Content-Type': 'application/json', Accept: args.includes('--json') ? 'application/json' : 'text/event-stream', Origin: option('--origin', 'https://ai-systems-today.github.io') };
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (anonKey) { headers.apikey = anonKey; headers.Authorization = `Bearer ${anonKey}`; }
    const serviceKey = process.env.SUPABASE_BENCHMARK_SERVICE_KEY;
    if (serviceKey) { headers.apikey = serviceKey; headers.Authorization = `Bearer ${serviceKey}`; }
    const response = await fetch(endpoint, { method: 'POST', headers, signal: AbortSignal.timeout(Number(option('--timeout-ms', 60000))),
      body: JSON.stringify({ message: test.question, sessionToken: `benchmark-${report.runId}-${test.id}`, deviceId: randomUUID(), captureBenchmarkEvidence: Boolean(serviceKey) }) });
    payload = await readBenchmarkResponse(response, started);
    if (!response.ok) payload.error = `Application HTTP ${response.status}`;
  } catch (error) { payload = { error: error.name === 'TimeoutError' ? 'Application timeout' : 'Application request failed' }; }
  const observedEvaluator = payload.evidence?.integrations?.ragas?.evaluatorVersion;
  if (observedEvaluator && report.evaluatorVersion === 'unknown') report.evaluatorVersion = observedEvaluator;
  if (observedEvaluator && report.evaluatorVersion !== observedEvaluator) payload.error = 'Evaluator changed during benchmark';
  const result = evaluateCase(test, payload, Math.round(performance.now() - started));
  result.startedAt = startedAt; result.finishedAt = new Date().toISOString();
  // Saved privately under work/. Public projection must remove this raw response.
  result.privatePayload = payload;
  if (result.evidence?.versions.backend && report.applicationVersion === 'unknown') report.applicationVersion = result.evidence.versions.backend;
  if (result.evidence?.versions.backend && report.applicationVersion !== result.evidence.versions.backend) result.failures.push('Backend changed during benchmark');
  if (result.failures.length) result.status = 'failed';
  report.cases.push(result);
  await save();
  console.log(`${test.id}: ${result.status}`);
}
if (report.cases.length !== dataset.cases.length) report.comparisonWarnings.push('Partial suite: not all selected dataset cases executed');
report.gateFailures = applyGates(report, gates);
report.status = report.gateFailures.length ? 'failed' : report.cases.some(c => c.status === 'not-evaluated') ? 'not-evaluated' : 'passed';
await save();
await writeFile(new URL(output.href + '.txt'), `Persora fresh-answer test run ${report.runId}\nStatus: ${report.status}\nCases: ${report.cases.length}\n${report.gateFailures.join('\n')}\n`);
console.log(`Saved ${output.pathname}; ${report.status}`);
if (report.status !== 'passed') process.exitCode = 1;
