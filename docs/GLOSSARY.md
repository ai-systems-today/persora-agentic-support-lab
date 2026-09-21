# Terminology and glossary

## Core AI terms

| Term | Plain-language meaning |
|---|---|
| Agent | Software that uses a model plus instructions, tools, knowledge and state to complete a task |
| Agentic AI | AI that can select and execute controlled steps rather than produce only one text completion |
| Hallucination | Output that is fabricated, unsupported or inconsistent with the available evidence |
| Grounding | Constraining and checking an answer against approved evidence |
| RAG | Retrieval-Augmented Generation: retrieve relevant knowledge, then use it when generating an answer |
| Embedding | A numeric representation used to compare semantic similarity |
| Vector search | Finding records whose embeddings are close to the query embedding |
| Chunk | A bounded piece of a source document stored for retrieval |
| Citation | A reference connecting an answer or claim to a source |
| Context | Retrieved material supplied to the model or evaluator |
| Guardrail | A deterministic or model-assisted control that allows, blocks or constrains behavior |
| Handoff | Transfer of control to a human or another controlled system |

## Orchestration terms

| Term | Meaning in this system |
|---|---|
| Orchestration | Selecting, ordering and coordinating steps, agents and tools |
| Sequential | One step completes before the next begins |
| Concurrent | Independent checks run at the same time and then converge |
| Group chat | Multiple matching specialists contribute to one bounded task |
| Bounded recovery | A planner may revise within a strict iteration limit |
| LangGraph | The graph runtime used to define and execute agentic states and transitions |
| LangChain | The wider ecosystem of model, tool, retriever and workflow abstractions related to LangGraph |

## Protocols and observability

| Initialism | Expanded form | Meaning |
|---|---|---|
| A2A | Agent-to-Agent | A protocol for discovering and exchanging tasks/messages with agents |
| AG-UI | Agent–User Interaction Protocol | Structured events for streaming agent progress and results to a UI |
| MCP | Model Context Protocol | A standard tool/resource interface used here by the source browser |
| SSE | Server-Sent Events | A one-way HTTP stream used to send progressive events to the browser |
| OTLP | OpenTelemetry Protocol | The telemetry transport used for Langfuse trace export |
| Trace | The end-to-end record of one request |
| Span | One timed operation inside a trace |
| Observation | A sanitized view of a traced operation |

## Quality terms

| Metric | Question it answers |
|---|---|
| Faithfulness | Are answer claims supported by the supplied contexts? |
| Response relevancy | Does the answer address the user’s question? |
| Context precision | How much of the retrieved context is useful? |
| Context recall | Does the context cover the trusted reference answer? |
| Factual correctness | Does the answer agree with a trusted reference? |
| Citation validity | Do cited reference numbers point to returned sources? |
| Intent coverage | Does the answer cover the required parts of a multi-intent request? |

## Data terms

| Term | Meaning |
|---|---|
| pgvector | PostgreSQL extension for storing and searching vectors |
| Pinecone | Managed vector service used by the Hybrid RAG demonstration to return ranked chunks |
| Milvus | Open-source vector database documented here as a future self-hosted or managed alternative; not executed by this repository |
| Neo4j | Native graph database used by the Hybrid RAG demonstration for bounded relationship queries |
| `pg_graphql` | PostgreSQL extension that exposes a GraphQL API; it is not a graph database |
| Apache AGE | Graph extension that adds graph structures and Cypher-style querying to PostgreSQL |
| GraphRAG | Retrieval that uses entities and relationships in a graph alongside or instead of vector similarity |
| AKS | Azure Kubernetes Service: Azure's managed Kubernetes platform and the documented Azure fit for a self-hosted Milvus cluster |
| ACA | Azure Container Apps: a serverless container application platform suitable for APIs and workers around Milvus, not a managed Milvus database |
| Helm | Kubernetes package manager used by Milvus's documented cluster installation path |
| RLS | Row-Level Security: database policies that restrict which rows a caller can access |
| JWT | JSON Web Token: a signed token carrying identity/authorization claims |

## Persora evidence terms

| Term | Meaning |
|---|---|
| Exact-run | Belongs to the selected request rather than another example or aggregate |
| Evidence projection | Allow-listed data safe to return to the public browser |
| Input hash | A digest showing which inputs were evaluated without exposing those inputs |
| Fixture | Checked-in deterministic example data used for repeatable UI demonstration |
