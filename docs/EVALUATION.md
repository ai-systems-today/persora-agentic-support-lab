# Evaluation and Test Results

## What is tested and what establishes correctness

Official Netflix Help passages establish product facts, subject to their country, device, plan and account conditions. Human-reviewed case expectations must cite those passages. Application policy establishes allowed actions and approvals. Actual tool results establish what an action accomplished. A model judge supplies a fallible measurement; it is not the source of truth.

evaluation/dataset.json contains six expandable smoke scenarios. Its expectations are researched drafts and deliberately remain pending human review. Source hashes identify the fetched pages; source snapshots remain private under work/. Updating a page invalidates its review. Do not change pending to approved without a named reviewer and review date. Frozen human labels in evaluation/judge-labels.json calibrate judges using separate development and held-out cases.

The existing five saved-answer fixtures remain reproducible fixture metrics. They do not measure newly generated chatbot answers.

## Six implementation steps

1. Freeze source evidence and conditional case expectations. scripts/snapshot_sources.py records source hashes and invalidates changed reviews.
2. Capture actual execution evidence. The upstream private patch records query arguments, scope membership, capped prompt passages and retrieval spans. The lab validates run IDs and context hashes. Public calls never receive raw private captures.
3. Evaluate each live answer. Lexical checks remain diagnostics. The Azure custom judge is labelled explicitly as custom. Invalid citations or unsupported claims cause a fallback; unavailable or failed verification causes qualification. Preserve both draft and final answer and score the exact final text.
4. Run a fresh-answer benchmark. scripts/run_benchmark.mjs calls the candidate endpoint for every selected case, checkpoints atomically and supports resume. It is usable after a change or whenever a comparison is needed. A benchmark does not publish anything.
5. Apply offline metrics and export available numeric scores to Langfuse. Official RAGAS metrics are separate from custom diagnostics. Reviewed document labels support ranking metrics. Missing contexts, labels, usage, credentials or measurements remain unavailable, never zero or a fabricated pass.
6. Inspect Test Results, compare a baseline and apply gates. Publishing is a separate deployment action. A pending review, partial suite or missing required provenance prevents a passing release gate.

## Where results appear

The lab's Test Results tab loads benchmark JSON locally, includes answers, expected facts, source links, decisions, metrics and baseline differences, and can download the loaded report. A saved public baseline is provided with explicit limitations. The initial baseline describes the existing deployment, not the new candidate.

Langfuse retains its separate private dashboard. The lab report is not an embedded Langfuse chart. Live numeric scores use the public scores API; benchmark experiment observations use Langfuse v4 OTLP experiment attributes. Missing exports are visible. Private console URLs and credentials are not exposed by the public UI.

## Measurements and limits

Capture answer latency, first streamed answer content, retrieval-only latency and evaluator latency separately. JSON transport cannot provide first-content latency. Parallel retrieval uses the enclosing elapsed window, not summed overlapping durations. UTC cross-service windows depend on synchronized clocks. Display median with sample count and empirical p95 only with at least 20 samples.

Track lexical grounding, citation validity/coverage, custom faithfulness/relevance, unsupported claims, official RAGAS faithfulness, context precision/recall, factual correctness and answer relevancy. Custom diagnostics add claim contradictions, semantic citation support, reviewed required-fact coverage and query intent. Ranking precision/recall/nDCG require reviewed stable document labels. Concatenated specialist results do not establish a global search ranking; label per-leg ranking as unavailable until a defined merge ranking exists.

Track actual filter compliance, returned-row scope membership, policy outcomes, tool correctness/task success, token usage and cost only where corresponding evidence exists. No complete provider tool trajectory or billed usage is inferred from trace counts. Missing values retain reasons.

Reference-dependent correctness cannot pass on unreviewed expectations. Semantic and latency thresholds remain pending calibration instead of arbitrary numbers. Human calibration is still required.

## Candidate deployment and execution

Deploy the isolated upstream changes to azure-chat and orchestrate-chat first; no schema migration is introduced. Set PERSORA_CHAT_COMMIT_SHA and CORPUS_VERSION to actual deployed upstream/corpus revisions. Deploy the lab agentic-support-demo and netflix-specialist-a2a functions, setting APP_COMMIT_SHA to the lab revision. Use the existing service credential only on server-to-server requests. The browser uses the ordinary publishable credential.

For an offline benchmark, configure BENCHMARK_ENDPOINT, SUPABASE_PUBLISHABLE_KEY and SUPABASE_BENCHMARK_SERVICE_KEY as server-side CI secrets. Azure judging requires AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT; answer relevancy also requires AZURE_OPENAI_EMBEDDING_DEPLOYMENT. Langfuse export requires LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY. Never place these keys in Vite variables or public files.

Install requirements-eval.txt; run:
- node --experimental-strip-types scripts/run_benchmark.mjs --output work/benchmark-report.json --max-requests 6
- python scripts/evaluate_fresh_ragas.py --report work/benchmark-report.json
- python scripts/evaluate_diagnostics.py --report work/benchmark-report.json
- python scripts/calibrate_judge.py --help
- node --experimental-strip-types scripts/export_langfuse.mjs work/benchmark-report.json
- node --experimental-strip-types scripts/check_benchmark.mjs work/benchmark-report.json
- node scripts/public_report.mjs work/benchmark-report.json work/benchmark-report.public.json

The manual benchmark workflow uploads only the allowlisted public projection and performs no deployment. Public projection is permitted only for the explicitly synthetic public dataset; raw captures stay private. Expand the dataset for representative quality, policy, retrieval and load coverage.

## Validation completed locally

Controlled handler tests cover captured context, unsupported-draft fallback and unavailable-evaluator qualification. Upstream capture tests cover trusted admission, unchanged ordinary calls, actual scope and exact prompt fragments, and missing measurements. Both upstream handlers type-check. These checks validate code contracts; they are not a deployed official RAGAS benchmark.

## Primary references

- https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/
- https://langfuse.com/docs/evaluation/experiments/compare-experiments
- https://langfuse.com/docs/evaluation/evaluation-methods/scores-via-sdk
- https://supabase.com/docs/guides/functions/background-tasks
- Netflix Help source URLs and hashes are recorded in evaluation/dataset.json.
