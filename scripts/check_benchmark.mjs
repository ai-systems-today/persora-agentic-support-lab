import { readFile } from 'node:fs/promises';
import { applyGates } from './benchmark_core.mjs';
const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
const gates = JSON.parse(await readFile(new URL('../evaluation/gates.json', import.meta.url), 'utf8'));
const failures = applyGates(report, gates);
console.log(failures.length ? failures.join('\n') : 'Benchmark gates passed');
if (failures.length || report.status === 'running') process.exitCode = 1;
