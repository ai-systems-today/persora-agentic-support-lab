import { readFile, writeFile } from 'node:fs/promises';
export function publicReport(report) {
  const redact = text => String(text ?? '').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]').replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_PAYMENT_NUMBER]');
  return { schemaVersion: report.schemaVersion, runId: report.runId, createdAt: report.createdAt,
    datasetVersion: report.datasetVersion, sourceVersion: report.sourceVersion, applicationVersion: report.applicationVersion,
    evaluatorVersion: report.evaluatorVersion, scope: report.scope, status: report.status, projection: 'public-summary',
    comparisonWarnings: [...(report.comparisonWarnings ?? []), 'Public summary omits full source passages and private execution payloads'],
    cases: report.cases.map(c => ({ caseId: c.caseId, question: redact(c.question), category: c.category, runId: c.runId,
      status: c.status, answer: redact(c.answer), metrics: c.metrics.map(m => ({ name: m.name, value: m.value, unit: m.unit, status: m.status, method: m.method, reason: redact(m.reason) })),
      failures: c.failures.map(redact), evidence: null, sources: c.sources.map(s => ({ label: redact(s.label), url: s.url && /^https:\/\/help\.netflix\.com\//.test(s.url) ? s.url : null, text: '' })),
      expectedFacts: c.expectedFacts.map(redact), reviewStatus: c.reviewStatus, langfuseExported: c.langfuseExported })) };
}
if (process.argv[1]?.endsWith('public_report.mjs')) {
  const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
  if (!report.publicSyntheticInput) throw new Error('Public export requires a run explicitly restricted to public synthetic test inputs');
  await writeFile(process.argv[3], JSON.stringify(publicReport(report), null, 2) + '\n');
  console.log('Saved allow-listed public summary; raw payload and full passages omitted');
}
