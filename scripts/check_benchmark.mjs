import { readFile, writeFile } from 'node:fs/promises';
import { applyGates } from './benchmark_core.mjs';
import { publicReport } from './public_report.mjs';
const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
const gates = JSON.parse(await readFile(new URL('../evaluation/gates.json', import.meta.url), 'utf8'));
const failures = applyGates(report, gates);
report.gateFailures = failures;
report.status = failures.length || report.status === 'running' ? 'failed' : 'passed';
await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
if (report.publicSyntheticInput === true) {
  const publicPath = process.argv[2].endsWith('.json') ? process.argv[2].slice(0, -5) + '.public.json' : process.argv[2] + '.public.json';
  await writeFile(publicPath, JSON.stringify(publicReport(report), null, 2) + '\n');
}
console.log(failures.length ? failures.join('\n') : 'Benchmark gates passed');
if (failures.length || report.status === 'running') process.exitCode = 1;
