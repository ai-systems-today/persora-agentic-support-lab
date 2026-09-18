# Persora Agentic Support Lab

An interview-ready, evidence-first Netflix support demonstration. The application is intentionally separate from LibreChat and does not import or modify that repository.

## What the demo shows

- A working support chatbot with five conversational starters and multi-turn history.
- Case-specific answers for grounding, access control, approval/handoff, group chat and recovery.
- An additive **Explain this answer** drawer.
- A separate fixture run for every supported answer.
- Topology-specific orchestration graphs for sequential, concurrent, group-chat, handoff and Magentic/planner patterns.
- Graph, timeline and evidence-flow visualisations plus five architecture layers:
  1. Orchestration
  2. Content & data
  3. Interaction
  4. Observability
  5. Quality
- Explicit evidence labels: Runtime-proven, Repo-defined, Fixture replay, Not captured, Not executed and Not evaluated.
- An opt-in **Live agent** mode that streams the published Netflix Support Assistant response and renders the citations returned by that exact run.
- An additive **Agentic run** mode backed by JWT-protected Supabase Edge Functions. It executes a real LangGraph graph, streams standards-based AG-UI events, runs a deterministic authorization guardrail before retrieval, pauses mutation requests for human approval, and calls the published Netflix agent with its returned citations.
- Distinct sequential, concurrent privacy-check, A2A group-specialist, human-handoff, and bounded revise-or-finish recovery execution paths, each with exact-run proof.
- An exact-run deterministic quality gate for published answers: citation-index validity, lexical grounding and answer relevance. It retries once with stricter citation instructions, then fails closed instead of displaying an unverifiable generated answer.
- A pinned, server-side RAGAS contract benchmark that is explicitly separated from per-answer evidence.
- Progressive run status while LangGraph nodes execute, contextual follow-up questions, a selectable orchestration canvas, and a node inspector backed by that run's trace.
- A sanitized public trace projection that exposes route reasoning, nodes, timings, protocol-event counts and citation counts without exposing the private Langfuse console or credentials.
- Ranked retrieval evidence derived from the exact citations returned by the existing Persora KB path; no second vector database is implied.

The labels are the central design rule: an optional technology is never presented as live merely because the UI has a field for it.

## Run locally

```bash
npm install
npm run dev
```

No provider registration or API key is required for fixture mode.

Live mode calls the already-published Persora widget endpoint using its public widget identifier. No Azure OpenAI or Supabase service-role secret is placed in the browser. The deployment origin must be allowed by the published widget; if it is not, the UI shows the failure and does not silently substitute a fixture answer.

Agentic mode calls `agentic-support-demo`, which requires the project’s browser-safe publishable/anon JWT and independently enforces the GitHub Pages/localhost origin allow-list. The function is isolated from LibreChat and from the existing Persora orchestration functions.

The Vite base path is configured for this repository's GitHub Pages URL.

## Validate

```bash
npm test
npm run build
```

Every push to `main` runs the evidence-contract tests, builds the production application and deploys the resulting `dist` directory through `.github/workflows/pages.yml`.

## Credentials and real integrations

Copy `.env.example` to `.env` only when adding a server-side adapter. Never place secrets in a `VITE_*` variable: Vite exposes those values to the browser bundle. The checked-in project contains variable names only, not credential values.

Potential adapters are deliberately provider-neutral:

| Layer | Target technology | Proof required before the UI may claim it ran |
|---|---|---|
| Orchestration | LangChain / LangGraph | Node events or a serialized run trace |
| Content & data | Persora KB / Supabase vector retrieval | Citation events from the published run |
| Content & data | Pinecone / Milvus / Neo4j | Query, source IDs and returned records/chunks |
| Interaction | AG-UI / A2A | Captured protocol event/transport envelope |
| Observability | Langfuse | Trace and observation identifiers |
| Quality | RAGAS | Metric name, input set, score and evaluator run |

Current execution truth:

| Capability | Current state |
|---|---|
| Azure OpenAI + Netflix KB + citations | Executed through the published Persora agent |
| LangGraph | Executed in `supabase/functions/agentic-support-demo/index.ts` |
| Deterministic authorization guardrail | Executed before the KB/model path |
| Prompt version | Returned by every agentic run |
| Exact-run quality gate | Runs on each published answer in agentic mode; reports grounding, citation validity and answer relevance, retries once, and fails closed on a second failure |
| Correctness | Not inferred from grounding or citation presence; remains not evaluated unless a trusted reference or human judgment evaluates that exact answer |
| AG-UI lifecycle, step, text, subagent and custom evidence events | Progressively streamed by every agentic run; upstream answer text arrives as one delta after the graph completes |
| A2A | Agent Card discovery and `message:send` execute on the group-chat route through `netflix-specialist-a2a` |
| Langfuse | OTLP root span and child observations implemented; the server reads the current trace back and returns an allow-listed observation projection without private URLs, content or identifiers |
| RAGAS | Pinned `0.4.3` six-metric deterministic reference-contract evaluation executes in CI; it is never presented as a score of the newly generated live answer |
| Pinecone / Milvus | Not executed; the demo intentionally reuses Persora's current Supabase/Postgres vector retrieval and returned citations |
| Neo4j GraphRAG | Not executed until a graph query returns records |

### Interaction contracts

- `agentic-support-demo` returns an AG-UI Server-Sent Event stream when the client requests `text/event-stream`. The stream includes `RUN_STARTED`, progressive step events, text-message events, contextual follow-ups, one custom evidence event and `RUN_FINISHED`.
- The human-handoff route finishes with an interrupt outcome and an evidence summary; it never claims that an account mutation or refund occurred.
- The group-chat route discovers the specialist Agent Card and sends an A2A 1.0 `message:send` request. The returned task artifact becomes bounded context for the primary published agent.
- The A2A specialist endpoint is JWT-protected and invokes the existing published Persora Netflix agent. Browser clients never receive a service-role credential.

### RAGAS benchmark

`scripts/evaluate_ragas.py` uses six pinned RAGAS metrics on five checked-in deterministic contract samples: `NonLLMStringSimilarity`, `StringPresence`, `ExactMatch`, `BleuScore`, `CHRFScore` and `RougeScore`. GitHub Actions regenerates `src/generated/ragas-evaluation.json` before tests and build. The artifact contains a score set for each stable demo-case ID plus release-level averages. The UI labels these as reference-contract evidence, not live-answer correctness. The exact generated answer's correctness remains **not evaluated** unless that exact output is compared with a trusted reference or reviewed by a human.

### Enable Langfuse execution proof

The shared Supabase project has reached its Edge Function secret limit, so production credentials are read from encrypted Supabase Vault rows through a service-role-only RPC. Create these named Vault entries:

```text
persora_langfuse_public_key=pk-lf-...
persora_langfuse_secret_key=sk-lf-...
persora_langfuse_base_url=https://cloud.langfuse.com
```

The migration grants `get_agentic_demo_secrets()` only to `service_role`, checks the JWT role again inside the function, and returns only the three allow-listed demo values. Local development may still use the `LANGFUSE_*` environment variables documented in `.env.example`.

The Edge Function sends one OTLP root span plus one child span per executed LangGraph node to Langfuse's `/api/public/otel/v1/traces` endpoint. Session identifiers are SHA-256 hashed before export; blocked prompts are fully suppressed; and email addresses, payment-number-shaped values and common account identifiers are redacted from allowed prompts and answers before telemetry export. It returns a server-secret HMAC proof without waiting for the observation API. When Explain is opened, the browser uses that proof for bounded background read-back of the exact trace. The public drawer receives only observation name, type, level, duration and optional aggregate usage/cost fields; it never receives observation IDs, private URLs, credentials, inputs, outputs, project IDs or user/session IDs. If ingestion is not queryable within the retry window, the UI says read-back is pending rather than fabricating observations.

### Automatic orchestration routing

`supabase/functions/_shared/orchestrationRouter.ts` applies a deterministic policy router before the graph branches. Mutation and refund requests route to human handoff; sensitive cross-account requests route to concurrent privacy checks; failed recovery attempts route to the bounded planner; multi-domain questions route to the A2A specialist exchange; and ordinary single-intent support questions follow the sequential grounded path. Every run returns the selected pattern, matched signals, confidence and plain-language reason so the route is inspectable rather than inferred from the picture alone.

The concurrent route sends the privacy-policy and safe-alternative checks as two independent internal HTTP executions, then returns their start/finish timings plus measured overlap. The Magentic route records each bounded planner decision: it either finishes on the first attempt or revises once after a reported failure and then asks only for source-backed alternatives. The UI reports missing overlap or missing planner decisions as unproved rather than inferring them from the topology.

## Five-minute interview flow

1. Start with **Why can’t I stream while travelling?** and show the answer and its unique run ID.
2. Open **Explain this answer**. Point out the execution graph and evidence-status legend.
3. Click all five layers and distinguish what the browser proves from what fixture mode replays.
4. Run **Can you reveal another account’s billing?** to show an authorization boundary.
5. Run **Cancel my subscription and refund me.** to show an approval-gated human handoff.
6. Run the group-chat case to show the real A2A Agent Card + task exchange before the primary agent answers.
7. Run the failed-path case to show the planner's recorded revise-or-finish decisions and preserved context.
8. Switch between graph, timeline and evidence flow, then close with the stack map: the contracts remain stable while adapters supply real LangGraph, retrieval, A2A/AG-UI, Langfuse and RAGAS evidence.

For full run proof, use **Agentic run**, submit one grounded question, open **Explain this answer**, and show the returned citations, exact-run quality scores, node trace and measured latency. **Live agent** calls the published agent directly and therefore does not claim that the demonstration's LangGraph pattern or exact-run quality gate executed.

## Repository isolation

This project is standalone. It must not be nested in, copied into, or used to modify the LibreChat repository. Reusing credentials means configuring them at runtime through ignored server-side environment variables—not copying secrets or `.env` files between repositories.
