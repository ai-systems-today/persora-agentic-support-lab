# How to use this manual

The manual is written as a progressive course. Each chapter introduces a concept, connects it to the repository, and distinguishes current execution from future options.

## Three levels of understanding

### 1. Concept

Learn what the term means in plain language. For example, *grounding* means constraining an answer to information supported by approved evidence.

### 2. System behavior

Learn where the concept appears in the request lifecycle. Grounding, for example, depends on retrieval, citations, claim checks and evaluation—not on a single prompt.

### 3. Proof

Learn what evidence demonstrates that behavior for one run. A citation list proves that sources were returned; it does not, by itself, prove that every answer sentence is supported.

## Evidence vocabulary used throughout

| Status | Read it as |
|---|---|
| Runtime-proven | “The selected run supplied evidence.” |
| Repo-defined | “The implementation exists in this revision.” |
| Fixture replay | “This is deterministic example evidence.” |
| Not captured | “It may have happened, but no proof was returned.” |
| Not executed | “This path did not use it.” |
| Not evaluated | “There is no valid score for this field.” |

## How to read technology comparisons

Technology chapters use four separate questions:

1. What problem does the technology solve?
2. Is that problem present today?
3. What measurable trigger would justify adoption?
4. What runtime evidence would prove that the adapter executed?

This prevents a long list of fashionable technologies from becoming a false architecture claim.

## Suggested exercises

1. Run one sequential question and identify its route, citations and quality evidence.
2. Run a sensitive cross-account question and identify why retrieval is blocked.
3. Run a multi-domain question and inspect the A2A specialists.
4. Compare a deterministic quality result with a RAGAS-compatible evaluator result.
5. Find one field labelled **Not captured** and explain what evidence would be needed.
