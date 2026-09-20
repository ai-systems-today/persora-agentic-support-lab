# How “Explain this answer” works

## Purpose

Explain is a run-specific evidence inspector. It helps a reviewer answer four questions:

1. Which route ran?
2. Which systems returned evidence?
3. What supported the displayed answer?
4. What was not executed, captured or evaluated?

It is not a chain-of-thought viewer. It does not expose hidden model reasoning, prompts, credentials, raw private traces or private Langfuse links.

## When it is available

The button appears when a conversation turn has both a run identifier and a mapped demonstration case.

| Answer type | Explain availability |
|---|---|
| Demo replay starter or supported mapped question | Available with fixture evidence |
| Full agentic run | Available; runtime evidence replaces fixture fields when returned |
| Direct live starter tied to a demo case | Available, while orchestration-only fields remain unproved |
| Direct free-form live question without a mapped case | Not displayed |

## Drawer contents

### Run header

Shows the run ID, case summary and counts of proven, fixture and absent evidence fields.

### Execution views

- **Execution graph:** selected topology and node inspector.
- **Run timeline:** ordered nodes and returned durations when captured.
- **Evidence flow:** knowledge source → route → response → quality evaluation.

### Five evidence layers

| Layer | Examples |
|---|---|
| Orchestration | selected pattern, routing reason, specialist identity, node trace |
| Content & data | knowledge source, citations, retrieval provider, vector-store classification |
| Interaction | AG-UI events, A2A exchange, human handoff |
| Observability | trace ID, sanitized trace projection, latency, prompt version, Langfuse read-back |
| Quality | grounding, citation validity, relevance, RAG evaluation, unsupported claims |

### Evidence labels

| Label | Meaning |
|---|---|
| Runtime-proven | Returned or measured for the selected run |
| Repo-defined | Verified implementation fact, but not proof that it executed in this run |
| Fixture replay | Deterministic demonstration evidence |
| Not captured | May have occurred, but the selected run returned no proof |
| Not executed | The route did not run that capability |
| Not evaluated | No valid evaluation result exists for the field |

## Langfuse read-back

When the server reports a Langfuse export, the drawer performs bounded background read-back attempts. The browser receives only allow-listed observation metadata such as name, type, status and duration. It never receives observation IDs, private URLs, credentials, raw inputs, raw outputs, project IDs or user/session identifiers.

## Human handoff

For an approval-gated route, Explain can display the persisted demo decision and let the operator approve or reject the safe continuation. This records orchestration state only; it does not cancel an account, issue a refund or perform another Netflix mutation.

## Implementation map

- Button and drawer selection: `src/App.tsx`, `Conversation` and `App`.
- Drawer: `ExplainDrawer`.
- Graph/timeline/evidence views: `ExecutionVisuals`.
- Evidence transformation: `layersForTurn`.
- Evidence field rendering: `LayerPanel`.
- Runtime contracts: `src/types.ts` and `src/liveClient.ts`.
