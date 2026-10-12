// Optional server-side export. No console URL, private input or credentials enter public reports.
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { exportNumericScores } from '../supabase/functions/_shared/langfuseScores.ts';
export async function exportExperiment(report, config, fetcher = fetch) {
  if (!config.baseUrl || !config.publicKey || !config.secretKey) return { status: 'unavailable', reason: 'Langfuse server credentials not configured' };
  if (!new URL(config.baseUrl).protocol.startsWith('https')) throw new Error('HTTPS required for Langfuse');
  const results = [];
  const attr = (key, value) => ({ key, value: { stringValue: typeof value === 'string' ? value : JSON.stringify(value) } });
  for (const c of report.cases) {
    // Never export blocked prompts, including synthetic blocked examples.
    if (c.blocked || (c.category === 'policy' && /another Netflix account/i.test(c.question))) { results.push({ caseId: c.caseId, status: 'suppressed' }); continue; }
    const traceId = randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');
    const end = BigInt(Date.now()) * 1000000n;
    const startTime = c.startedAt ? BigInt(Date.parse(c.startedAt)) * 1000000n : end;
    const endTime = c.finishedAt ? BigInt(Date.parse(c.finishedAt)) * 1000000n : end;
    const span = { traceId, spanId, name: `benchmark:${c.caseId}`, kind: 1,
      startTimeUnixNano: String(startTime), endTimeUnixNano: String(endTime),
      attributes: [attr('langfuse.observation.type', 'span'), attr('langfuse.experiment.id', report.runId),
        attr('langfuse.experiment.name', `${report.datasetVersion}:${report.applicationVersion}`),
        attr('langfuse.experiment.item.id', c.caseId), attr('langfuse.experiment.item.root_observation_id', spanId),
        attr('langfuse.experiment.metadata', { datasetVersion: report.datasetVersion, sourceVersion: report.sourceVersion, evaluatorVersion: report.evaluatorVersion, scope: report.scope }),
        attr('langfuse.experiment.item.metadata', { caseId: c.caseId, reviewStatus: c.reviewStatus, status: c.status }),
        attr('persora.request.run_id', c.runId), attr('persora.execution.timestamps_captured', Boolean(c.startedAt && c.finishedAt))], status: { code: c.status === 'failed' ? 2 : 1 } };
    try {
      const response = await fetcher(`${config.baseUrl.replace(/\/$/, '')}/api/public/otel/v1/traces`, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Basic ${btoa(`${config.publicKey}:${config.secretKey}`)}`, 'Content-Type': 'application/json', 'x-langfuse-ingestion-version': '4' },
        body: JSON.stringify({ resourceSpans: [{ resource: { attributes: [attr('service.name', 'persora-benchmark')] }, scopeSpans: [{ scope: { name: 'persora-evaluation', version: report.evaluatorVersion }, spans: [span] }] }] }) });
      if (!response.ok) throw new Error(`Trace export HTTP ${response.status}`);
      const scores = await exportNumericScores({ ...config, traceId, fetcher, scores: c.metrics.filter(m => m.status === 'evaluated').map(m => ({ name: m.name, value: m.value })) });
      results.push({ caseId: c.caseId, status: scores.status, exportedScores: scores.exported });
    } catch { results.push({ caseId: c.caseId, status: 'failed' }); }
  }
  return { status: results.some(r => r.status === 'failed' || r.status === 'partial') ? 'partial' : 'exported', results };
}
if (process.argv[1]?.endsWith('export_langfuse.mjs')) {
  const file = process.argv[2];
  const report = JSON.parse(await readFile(file, 'utf8'));
  const result = await exportExperiment(report, { baseUrl: process.env.LANGFUSE_BASE_URL, publicKey: process.env.LANGFUSE_PUBLIC_KEY, secretKey: process.env.LANGFUSE_SECRET_KEY });
  await writeFile(`${file}.langfuse.json`, JSON.stringify(result, null, 2));
  console.log(`Langfuse experiment export: ${result.status}`);
  if (result.status !== 'exported') process.exitCode = 1;
}
