# Persora Enterprise Agent Reliability Manual

This manual explains how Persora makes an AI-agent answer **grounded, measurable and inspectable**.

It uses the Persora Agentic Support Lab as a working reference. The support domain makes the ideas concrete, but the controls apply to enterprise assistants in regulated and knowledge-intensive environments.

## The problem Persora addresses

A language model can produce a confident answer without proving that the answer is correct. In an enterprise system, confidence is not evidence.

Persora separates five questions that are often mixed together:

1. **Did the system retrieve relevant knowledge?**
2. **Does the answer stay within that knowledge?**
3. **Did the correct workflow and specialist execute?**
4. **Were policy and approval boundaries respected?**
5. **Can an operator inspect the result without exposing private reasoning or secrets?**

The application records evidence for each question and labels missing evidence honestly.

## What you will learn

By the end of the manual, you should be able to:

- distinguish hallucination reduction from hallucination elimination;
- explain retrieval-augmented generation in plain language;
- follow an agentic request from intake to evidence presentation;
- understand sequential, concurrent, multi-agent, handoff and recovery orchestration;
- interpret grounding, relevance, citation and RAG evaluation metrics;
- separate observability from evaluation;
- understand AG-UI, A2A, MCP and server-sent events;
- choose between Postgres/pgvector, Pinecone, Milvus, Neo4j and Apache AGE using evidence-based triggers;
- identify which components are implemented, runtime-dependent, demonstrated or deliberate alternatives;
- identify what `pg_graphql` does—and why it is not a graph database;
- apply Persora's evidence labels to avoid overstating system capabilities.

## The central rule

!!! principle "Evidence before claims"
    A capability is not considered executed because its name appears in a diagram, configuration field or user interface. Persora marks it runtime-proven only when the selected run returns evidence of that execution.

## Proof application and product relationship

This repository is a public evidence lab for principles used by Persora agents. It demonstrates the reliability layer around published Persora support agents: routing, guardrails, evidence, evaluation, observability and explanation.

It does **not** claim to expose every private service or every builder capability in `agent.persora.ai`. Product-wide claims require evidence from the relevant product repository and deployed environment.

## Choose a learning path

| If you are… | Start with… |
|---|---|
| A business or product leader | [Philosophy and evidence](PHILOSOPHY.md) |
| New to agentic AI | [Glossary](GLOSSARY.md), then [Request lifecycle](LIFECYCLE.md) |
| An AI engineer | [Grounding and RAG](GROUNDING.md), then [Quality](QUALITY.md) |
| An architect | [Architecture](ARCHITECTURE.md), [Orchestration](ORCHESTRATION.md), [Technology decisions](TECHNOLOGY_DECISIONS.md) |
| A security or risk reviewer | [Public safety](PUBLIC_SAFETY.md), then [Explain](EXPLAIN.md) |
| An operator | [Observability](OBSERVABILITY.md), then [Operations](OPERATIONS.md) |

Use the **Next** link at the bottom of every page for the complete guided path.

For the complete component inventory, read [Technology stack](TECH_STACK.md). For the vector option not executed in this proof, read [Milvus for enterprise workloads](MILVUS_ENTERPRISE.md).
