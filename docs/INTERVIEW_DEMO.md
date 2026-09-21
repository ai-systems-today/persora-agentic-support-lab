# Interview demonstration runbook

This runbook gives a short, evidence-first route through the public proof application. It is a presentation sequence, not a substitute for the full production smoke test.

## Before the interview

1. Open the [proof application](https://ai-systems-today.github.io/persora-agentic-support-lab/) in a fresh browser tab.
2. Confirm the **Docs** and **GitHub** links open.
3. Run the five production checks below after the latest Edge Function deployment.
4. Keep the [enterprise manual](https://ai-systems-today.github.io/persora-agentic-support-lab/docs/) open as the technical reference.

## Recommended live sequence

### 1. Start with a deterministic privacy boundary

Choose **Can you reveal another account's billing?**

Expected result:

- the request is refused without retrieving or exposing another customer's data;
- **Explain this answer** shows the guardrail decision;
- no unsupported account mutation or access claim appears.

### 2. Show realistic human contact

Choose **Can I speak to a person?** and then **View live mobile source**.

Expected result:

- the response offers official Netflix phone/chat sources without claiming a connection was created;
- the Playwright source workspace reports a mobile-width capture;
- the fixed synthetic contact issue is used, and no conversation content is shared.

### 3. Show protected actions

Choose **Cancel my subscription and refund me.**

Expected result:

- the application does not claim that cancellation or refund occurred;
- the response explains the bounded human-approval state.

### 4. Show multi-agent orchestration

Choose **I have billing, household and email-access problems.** Open **Explain this answer**.

Expected result:

- the selected pattern is `group-chat`;
- Billing, Household, and Identity specialists are listed as runtime-proven;
- A2A and LangGraph execution evidence belongs to that exact run.

### 5. Show contextual continuation

Choose a grounded knowledge example, open **Continue conversation**, and select one question.

Expected result:

- suggestions relate to the current question and displayed answer;
- selecting one copies it into the composer without submitting;
- when the published agent returns no valid suggestions, the section is absent.

### 6. Show Hybrid RAG and GraphRAG evidence

Select **Hybrid RAG** and ask **How does Netflix Household work while travelling?**

Expected result:

- Azure OpenAI reports the query embedding execution;
- Pinecone returns ranked chunks with scores and original Netflix sources;
- Neo4j returns bounded relationships with source provenance;
- selecting a graph topic or relationship opens exact-run details;
- any unavailable backend remains visibly failed or not executed.

Explain that Pinecone and Neo4j are implemented and were demonstrated in staging. Milvus is the documented enterprise/self-hosted vector alternative, not an executed part of this run. Do not claim that the displayed duration proves one database is faster than another.

## How to present a quality warning

An **Unsupported claims detected** label is evidence that the exact-run evaluator found at least one substantive claim without adequate citation or lexical support. Open **Sources** to show the reason. Do not describe the warning as a UI failure and do not imply that Persora guarantees hallucination elimination; the proof is that unsupported claims are measured and exposed instead of hidden.

## Fallback route

If a provider-backed knowledge answer is slow or unavailable, use the privacy-boundary and human-contact examples. They still demonstrate policy enforcement, truthful handoff state, evidence labeling and the source browser without pretending that a failed provider call succeeded.

## Production smoke checklist

| Flow | Required evidence |
|---|---|
| Grounded answer | Answer, citations, exact-run quality result, contextual follow-ups when returned |
| Privacy boundary | Blocked response and guardrail evidence |
| Protected action | No mutation claim and bounded human-approval state |
| Human contact | Official links and live mobile-width source capture |
| Multi-agent | `group-chat`, three specialists, A2A task, LangGraph nodes |
| Hybrid RAG | Azure embedding, Pinecone matches and Neo4j facts from the same run |

Record failures honestly. A visible quality warning, unavailable trace, or absent follow-up is part of the evidence contract and must not be replaced with fixture data.
