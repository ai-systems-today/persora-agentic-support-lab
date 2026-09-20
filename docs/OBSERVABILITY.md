# Observability

Observability explains what the system did operationally. Evaluation explains whether the result was good. They overlap in the evidence drawer but answer different questions.

## What the run records

- trace identifier;
- total duration;
- ordered graph nodes and node durations;
- protocol event types and counts;
- route and specialist selection;
- prompt version;
- citation count;
- evaluation duration and status;
- private telemetry export status.

## Langfuse boundary

Langfuse is private. Server-side credentials are loaded from environment variables or service-role-only Vault access. The Edge Function exports an OTLP root span and child observations for executed nodes.

The public UI receives an allow-listed projection only:

- observation name;
- type and status;
- duration;
- optional aggregate token usage or cost.

It does not receive observation IDs, project IDs, raw inputs/outputs, private URLs, credentials or raw user/session identifiers.

## Privacy controls

- blocked prompts are not exported;
- session identifiers are hashed;
- common email, payment-number and account-identifier patterns are redacted;
- read-back uses a bounded retry window;
- missing ingestion is reported as pending or failed.

## Operational questions

| Question | Evidence |
|---|---|
| Which route ran? | routing decision and node trace |
| Where was time spent? | total and node durations |
| Which specialist ran? | returned specialist identity |
| Were citations returned? | citation count and records |
| Did telemetry export? | configured/executed state |
| Is the trace queryable? | sanitized read-back state |
| Was the answer supported? | quality metrics, not trace presence alone |

## Observability is not chain-of-thought

Traces should record controlled events, inputs metadata, outputs metadata and timings necessary for operations. They should not expose hidden model reasoning. Explainability here means auditable evidence and decisions, not private reasoning text.
