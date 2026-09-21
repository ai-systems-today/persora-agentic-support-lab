# Technology decisions

This chapter separates the current implementation from technologies Persora may adopt when a measurable requirement justifies them.

## Decision method

For every technology, ask:

1. What problem would it solve better than the current path?
2. What scale, latency, relationship or governance requirement triggers the change?
3. What migration and operating cost does it add?
4. What evidence will prove it executed?

## Current and candidate technologies

| Technology | Category | Status here | Consider it when | Do not add it merely because |
|---|---|---|---|---|
| Supabase/Postgres + vectors | Relational and vector data | Current Persora retrieval path | One governed platform satisfies metadata, tenancy and vector needs | A separate vector logo looks more “enterprise” |
| Pinecone | Managed vector service | Implemented; runtime-dependent; demonstrated in staging | A managed vector service is justified by measured scale, latency, isolation or operational needs | Vector search already works adequately in Postgres |
| Milvus | Vector database | Alternative; not executed | Self-hosting, Kubernetes control, data residency or measured dedicated-vector scale justifies its operations | Open-source availability or an “enterprise” label alone creates value |
| Neo4j | Native graph database | Implemented; runtime-dependent; demonstrated in staging | Relationship-heavy retrieval and graph traversal materially improve evaluated answers | Documents contain occasional cross-references |
| Apache AGE | PostgreSQL graph extension | Candidate; not executed | Graph querying is needed while keeping graph and relational data in PostgreSQL | The team wants to claim “GraphRAG” |
| `pg_graphql` | GraphQL API extension | Candidate API option; not graph retrieval | A GraphQL interface over PostgreSQL fits client/API requirements | Its name contains “graph” |
| LangGraph | Agent orchestration | Implemented | Stateful branching, interrupts and inspectable graph execution are required | A single model call is sufficient |
| LangChain | Integration ecosystem | Used indirectly with LangGraph package/runtime concepts | Reusable model/tool/retriever abstractions reduce duplication | An abstraction adds no current value |
| Langfuse | Observability | Implemented, runtime-dependent | Private traces, timings and cost/usage projections are required | A trace alone proves answer correctness |
| RAGAS-compatible evaluation | Quality evaluation | Implemented | Exact-run RAG quality needs measurable reasons and unsupported-claim detection | One aggregate score is desired |

## Vector-store decision

| Requirement | Postgres/pgvector | Pinecone | Milvus |
|---|---|---|---|
| Current role | Existing Persora knowledge path | Demonstrated Hybrid RAG vector path | Documented alternative |
| Operations | Shares the governed Postgres estate | Managed service | Self-managed on Kubernetes or obtained as a managed Milvus service |
| Best reason to choose | Relational metadata, tenancy and vectors belong together | Dedicated managed vector scale with low database operations | Infrastructure control, self-hosting, data placement or specialized large vector workloads |
| Proof required | Captured product retrieval records | Captured Pinecone query results and timing | Captured Milvus query results and timing after parity testing |

## Vector-store adoption gates

Before replacing the current provider or adding Milvus, capture a reproducible benchmark covering:

- corpus size and vector count;
- write/update rate;
- query latency percentiles;
- recall or task-quality metrics;
- metadata filtering and tenant isolation;
- operating cost and recovery requirements;
- migration and dual-write plan.

The adapter becomes runtime-proven only when the run captures the provider query, returned identifiers/chunks and timings.

## Graph adoption gates

Graph technology is appropriate when relationships are part of the question—not merely metadata attached to documents.

Candidate use cases include:

- dependencies between policies, products and jurisdictions;
- multi-hop entity relationships;
- organizational ownership and authorization graphs;
- root-cause paths across components;
- provenance connecting claims, sources and transformations.

Adoption requires an entity/relationship model, graph-query benchmark and measured improvement over the current retrieval baseline.

## Neo4j versus Apache AGE

| Consideration | Neo4j | Apache AGE |
|---|---|---|
| Primary shape | Dedicated native graph platform | Graph capability inside PostgreSQL |
| Operational model | Separate graph service | PostgreSQL extension and operations |
| Best fit | Graph is a central workload with dedicated tooling | Graph is additive to an existing Postgres estate |
| Evidence required here | Captured graph query and returned records | Captured AGE query and returned graph rows |

Neo4j is implemented in the Hybrid RAG path and is runtime-proven only for runs returning its backend evidence. Apache AGE remains a documented alternative and is not executed here.

## Milvus on Azure

Use AKS when Persora must operate a distributed Milvus cluster on Azure. Milvus's official Azure deployment guidance uses AKS and Helm. Azure Container Apps is appropriate for stateless retrieval APIs or ingestion workers around Milvus, but Microsoft does not describe ACA as a managed Milvus offering. A managed Milvus provider is the lower-operations alternative.

See [Milvus for enterprise workloads](MILVUS_ENTERPRISE.md) for adoption triggers, deployment choices, a fail-safe migration plan and authoritative references.

## `pg_graphql` is not GraphRAG

`pg_graphql` exposes PostgreSQL data through GraphQL. GraphQL is an API query language; it does not turn relational tables into a property graph or prove graph traversal. It may be useful for typed client access, but GraphRAG claims need graph data, graph queries and returned relationship evidence.
