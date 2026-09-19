# AGENTS.md — Persora Agentic Support Lab Operating Contract

All rules are **ALWAYS ON** and mandatory for every technical response and repository change.

Conflict resolution: Security > repository evidence > this contract > convenience.
If a rule cannot be satisfied, refuse and request human guidance.

---

## 1. Required Response Structure

All technical responses must use this order:

1. Repo-Proven Facts
2. Runtime-Proven Facts
3. Unknowns
4. Hypotheses (ranked)
5. Verification Plan
6. Recommended Fix

Do not state a root cause before sections 1–4.

## 2. Repository Preflight

Before any technical conclusion, recommendation, diagnosis, or change:

1. Read this file completely.
2. Resolve the current branch and full commit SHA.
3. Read every applicable nested `AGENTS.md`.
4. Read the relevant implementation, callers, tests, configuration, migrations, documentation, and contracts.
5. Search for existing implementations before declaring functionality absent or proposing a rebuild.
6. Obtain runtime evidence for runtime-dependent claims; otherwise classify them as unknown.

Conversation memory, screenshots, task descriptions, and filenames are not repository evidence.

## 3. Evidence Classification

Every material claim must be labeled exactly one of:

- `Repo-Proven:` directly supported by the inspected repository revision.
- `Runtime-Proven:` directly supported by a command, test, log, browser validation, database inspection, or deployed configuration inspected in the current work.
- `Externally-Proven:` directly supported by an authoritative cited source.
- `Hypothesis:` not yet proven and paired with evidence that would confirm or reject it.
- `Unknown:` evidence is missing.

Repository claims must identify the relevant path and code location. Runtime claims must state the action performed, environment inspected, observed result, and evidence limitation.

## 4. Minimal and Reversible Changes

Prefer the smallest reversible fix. Do not modify unrelated modules. Do not perform broad refactors or architecture changes unless explicitly requested.

A patch requires:

1. an evidenced failure condition;
2. a fix mapped to the proven cause;
3. defined validation criteria.

Otherwise provide only a verification plan.

## 5. Sensitive Boundaries and Human Approval

Changes to authentication, authorization, access control, RLS, billing, Supabase migrations, Edge Functions, API gateways, secrets handling, telemetry redaction, model selection, orchestration routing, evaluation contracts, or deployment configuration require:

`Human Approved: Kyriakos Antoniadis`

Approval is never inferred or fabricated. If the exact approval is absent, stop before making the protected change.

## 6. No-Guessing Gate (CG-16)

Before changing any model, configuration constant, architecture decision, routing policy, evaluation dataset, registry data, or security boundary:

1. State the current value with file-and-location proof.
2. State the proposed new value.
3. State why using Repo-Proven or Runtime-Proven evidence.
4. If evidence is missing, say: `I don't know` and stop.
5. Wait for explicit human confirmation before applying the change.

Violation requires an immediate stop and refusal.

## 7. Demo Truthfulness Contract

The UI must never present a technology or capability as executed merely because a field, fixture, label, or diagram exists.

- Preserve the evidence labels: Runtime-proven, Repo-defined, Fixture replay, Not captured, Not executed, and Not evaluated.
- A topology is runtime-proven only when the backend executed that route and returned evidence from the same run.
- A UI graph or route label alone is not execution proof.
- Live-mode failures must remain visible. Never silently substitute fixture data.
- A human-handoff run must not claim that a refund, cancellation, or account mutation occurred unless the mutation is independently proven.
- The repository must remain standalone and must not modify or imply changes to LibreChat.

## 8. Per-Question Evaluation Contract

- Every generated knowledge answer must run the server-side exact-run evaluator on that run's question, displayed answer, and retrieved contexts.
- Never reuse one question's scores, contexts, answer, or reference for another question.
- Reference-free metrics must execute for free-form questions. Reference-dependent correctness and context-recall metrics must be `Not applicable` unless the exact question has an approved trusted reference.
- The UI must expose the evaluator implementation, model, version, execution status, and hashes of the exact inputs used.
- The Python RAGAS release benchmark is CI evidence only and must never populate a live-run metric object.
- Any metric, input set, reference answer, score, version, or generated artifact change requires evidence and explicit human approval.

## 9. Private-Safe Langfuse Contract

The private Langfuse project and credentials must never be exposed to the browser.

Public trace read-back may include only the repository's allow-listed projection for the exact run, such as observation name, type, level, duration, and optional aggregate usage or cost fields.

Never expose:

- Langfuse credentials or secret-bearing headers;
- private console URLs;
- observation IDs, project IDs, user IDs, or raw session IDs;
- raw trace inputs or outputs;
- unredacted emails, payment-number-shaped values, or account identifiers.

Blocked prompts must not be exported. If ingestion or read-back is unavailable, report pending or unavailable; never fabricate observations.

## 10. Real Orchestration Contract

- Routing must be derived from the server-side orchestration policy and returned evidence, not inferred from the visualization.
- Sequential, concurrent privacy-check, A2A group-specialist, human-handoff, and bounded-recovery paths must remain distinguishable.
- A2A is runtime-proven only when Agent Card discovery and the task/message exchange execute.
- AG-UI is runtime-proven only from captured protocol events emitted by the same run.
- Retrieval and citations must come from the exact published-agent run shown to the user.
- Do not claim Pinecone, Milvus, Neo4j, or another adapter executed unless its query and returned records are captured.

## 11. Runtime and Repository Drift

When repository state and deployed behavior differ:

1. report both separately;
2. treat the deployed observation as evidence only for the inspected environment;
3. inspect deployment revision, configuration, feature flags, environment variables, caches, and migrations;
4. do not declare the root cause until the drift is verified.

## 12. Validation and Merge Gate

After a change:

1. inspect the complete diff;
2. run focused tests;
3. run `npm test`;
4. run `npm run build`;
5. when RAGAS inputs, evaluator code, dependencies, or generated output change, regenerate the evaluation artifact using the pinned requirements and verify the diff;
6. report passed, failed, and unexecuted checks separately;
7. assess regression and security risk.

Before declaring completion, state:

`Ready to merge: Yes` or `Ready to merge: No`

Do not declare ready when required tests fail or critical claims remain unverifiable.

## 13. Automated Fix Limit and Refusal Format

Attempt at most three automated fixes for one issue. After three failed attempts, stop and request human review.

When refusing, output only:

`Refusal Reason: <specific prerequisite or failure>`
`Required Evidence: <exact evidence required>`
`Next Step for Human Engineer: <one concrete action>`
