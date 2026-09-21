# Implementation reference

## Frontend

| Capability | Source |
|---|---|
| Conversation, starters and composer | `src/App.tsx` → `Conversation` |
| Explain drawer | `src/App.tsx` → `ExplainDrawer` |
| Graph, timeline and evidence views | `src/App.tsx` → `ExecutionVisuals` |
| Evidence-layer transformation | `src/App.tsx` → `layersForTurn` |
| Live and agentic SSE clients | `src/liveClient.ts` |
| Playwright source client | `src/browserClient.ts` |
| Runtime evidence contracts | `src/types.ts` |
| Hybrid RAG page | `src/HybridRagPage.tsx` |
| Hybrid API client and contracts | `src/hybridRagClient.ts` |
| Exact-run Neo4j graph | `src/RelationshipGraph.tsx`, `src/relationshipGraph.ts` |

## Server orchestration

| Capability | Source |
|---|---|
| LangGraph graph and AG-UI stream | `supabase/functions/agentic-support-demo/index.ts` |
| Deterministic policy router | `supabase/functions/_shared/orchestrationRouter.ts` |
| Specialist mapping | `supabase/functions/_shared/specialistRouter.ts` |
| Concurrent/recovery proof | `supabase/functions/_shared/orchestrationProof.ts` |
| A2A specialist endpoint | `supabase/functions/netflix-specialist-a2a/index.ts` |
| Source-browser endpoint | `supabase/functions/support-source-browser/index.ts` |
| Azure embedding, Pinecone and Neo4j route | `supabase/functions/hybrid-rag-demo/index.ts` |

## Quality

| Capability | Source |
|---|---|
| Citation normalization | `supabase/functions/_shared/citationEvidence.ts` |
| Deterministic grounding | `supabase/functions/_shared/answerQuality.ts` |
| Exact-run live evaluation | `supabase/functions/_shared/liveRagEvaluation.ts` |
| Verified fallback facts | `supabase/functions/_shared/verifiedKnowledgeFallback.ts` |
| CI benchmark | `scripts/evaluate_ragas.py` |
| Pinned dataset | `scripts/ragas_dataset.json` |
| Generated result | `src/generated/ragas-evaluation.json` |

## Evidence contract

The public runtime object can include:

- mode, transport, trace and total duration;
- citations and retrieval ranking;
- selected pattern, route reason and specialist;
- guardrail outcome and prompt version;
- graph-node and protocol events;
- deterministic and RAGAS-compatible quality results;
- handoff state;
- allow-listed Langfuse observations;
- A2A, AG-UI and LangGraph execution fields;
- separate Azure, Pinecone and Neo4j exact-run evidence records;
- Pinecone vector matches and Neo4j facts with source provenance;
- explicit provider failure/non-execution states without fixture substitution.

## Verification map

| Claim | Primary verification |
|---|---|
| Router behavior | `src/orchestrationRouter.test.ts` |
| Specialist behavior | `src/specialistRouter.test.ts` |
| Quality behavior | `src/answerQuality.test.ts` |
| Live evaluation | `src/liveRagEvaluation.test.ts` |
| Citation evidence | `src/citationEvidence.test.ts` |
| UI contracts | `src/chatUx.test.ts`, `src/data.test.ts` |
| Streaming parser | `src/liveClient.test.ts` |
| Hybrid client contract | `src/hybridRagClient.test.ts` |
| Relationship graph transformation | `src/relationshipGraph.test.ts` |
| Release invariants | `scripts/validate_release.mjs` |

Implementation presence is repository evidence. Execution claims still require evidence returned by the selected run.
