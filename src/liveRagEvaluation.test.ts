import { describe, expect, it, vi } from "vitest";
import { evaluateExactRun, referenceForQuestion } from "../supabase/functions/_shared/liveRagEvaluation";

const jsonResponse = (content: Record<string, unknown>) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(content) } }],
}), { status: 200, headers: { "Content-Type": "application/json" } });

describe("live exact-run RAG evaluation", () => {
  it("sends the exact question, answer, and contexts and records their hashes", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      const exactInput = JSON.parse(request.messages[1].content);
      expect(exactInput).toMatchObject({
        question: "What should I do?",
        answer: "Use the supported step [#1].",
        contexts: [{ index: 1, text: "[#1] Supported source text" }],
        trustedReference: null,
      });
      return jsonResponse({
        faithfulness: 1,
        responseRelevancy: 0.9,
        contextPrecision: 1,
        contextRecall: 0.2,
        factualCorrectness: 0.1,
        reasons: { faithfulness: "All claims are supported." },
        unsupportedClaims: [],
        relevantContextIndices: [1],
      });
    });
    const result = await evaluateExactRun({
      question: "What should I do?",
      answer: "Use the supported step [#1].",
      contexts: ["[#1] Supported source text"],
      reference: null,
      endpoint: "https://example.openai.azure.com",
      apiKey: "test-key",
      fetcher,
    });
    expect(result).toMatchObject({
      executed: true,
      scope: "request",
      status: "passed",
      referenceId: null,
      metrics: { faithfulness: 1, responseRelevancy: 0.9, contextPrecision: 1, contextRecall: null, factualCorrectness: null },
    });
    expect(result.inputHashes?.question).toHaveLength(64);
    expect(result.inputHashes?.answer).toHaveLength(64);
    expect(result.inputHashes?.contexts).toHaveLength(64);
  });

  it("fails the demonstrated unsupported GPS clause", async () => {
    const result = await evaluateExactRun({
      question: "How does Netflix determine my Household?",
      answer: "Netflix uses IP addresses and does not use GPS [#1].",
      contexts: ["Netflix uses IP addresses, device IDs, and account activity."],
      endpoint: "https://example.openai.azure.com",
      apiKey: "test-key",
      fetcher: async () => jsonResponse({
        faithfulness: 0.5,
        responseRelevancy: 0.9,
        contextPrecision: 1,
        contextRecall: null,
        factualCorrectness: null,
        reasons: { faithfulness: "The GPS clause is absent from the context." },
        unsupportedClaims: ["Netflix does not use GPS."],
        relevantContextIndices: [1],
      }),
    });
    expect(result.status).toBe("failed");
    expect(result.unsupportedClaims).toEqual(["Netflix does not use GPS."]);
  });

  it("keeps later specialist contexts in a multi-agent evaluation", async () => {
    const contexts = Array.from({ length: 24 }, (_, index) => `Specialist context ${index + 1}`);
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      const exactInput = JSON.parse(request.messages[1].content);
      expect(exactInput.contexts).toHaveLength(24);
      expect(exactInput.contexts[16]).toEqual({ index: 17, text: "Specialist context 17" });
      return jsonResponse({
        faithfulness: 1,
        responseRelevancy: 1,
        contextPrecision: 0.5,
        contextRecall: null,
        factualCorrectness: null,
        reasons: {},
        unsupportedClaims: [],
        relevantContextIndices: [1, 9, 17],
      });
    });
    const result = await evaluateExactRun({
      question: "Resolve billing, Household, and email access.",
      answer: "Three supported specialist results [#1] [#9] [#17].",
      contexts,
      endpoint: "https://example.openai.azure.com",
      apiKey: "test-key",
      fetcher,
    });
    expect(result.status).toBe("passed");
    expect(result.relevantContextIndices).toEqual([1, 9, 17]);
    expect(result.metrics.contextPrecision).toBe(0.125);
    expect(result.reasons.contextPrecision).toContain("3/24 relevant supplied contexts");
  });

  it("retries an evaluator result that omits a required metric", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        faithfulness: null,
        responseRelevancy: 0,
        contextPrecision: 0,
        contextRecall: null,
        factualCorrectness: null,
        reasons: {},
        unsupportedClaims: [],
        relevantContextIndices: [],
      }))
      .mockResolvedValueOnce(jsonResponse({
        faithfulness: 1,
        responseRelevancy: 1,
        contextPrecision: 1,
        contextRecall: null,
        factualCorrectness: null,
        reasons: {},
        unsupportedClaims: [],
        relevantContextIndices: [1],
      }));
    const result = await evaluateExactRun({
      question: "Question",
      answer: "Supported answer [#1].",
      contexts: ["Supported answer."],
      endpoint: "https://example.openai.azure.com",
      apiKey: "test-key",
      fetcher,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("passed");
  });

  it("normalizes faithfulness when the evaluator reports zero unsupported claims", async () => {
    const result = await evaluateExactRun({
      question: "Question",
      answer: "Supported answer [#1].",
      contexts: ["Supported answer."],
      endpoint: "https://example.openai.azure.com",
      apiKey: "test-key",
      fetcher: async () => jsonResponse({
        faithfulness: 0.5,
        responseRelevancy: 1,
        contextPrecision: 1,
        contextRecall: null,
        factualCorrectness: null,
        reasons: { faithfulness: "No unsupported claim was identified." },
        unsupportedClaims: [],
        relevantContextIndices: [1],
      }),
    });
    expect(result.metrics.faithfulness).toBe(1);
    expect(result.reasons.faithfulness).toContain("Contract normalization");
    expect(result.status).toBe("passed");
  });

  it("computes reference-dependent metrics only for an approved exact question", async () => {
    const question = "I am travelling and Netflix says this TV is not part of my household. What should I do?";
    const reference = referenceForQuestion(question);
    expect(reference?.id).toBe("grounded-answer@2026-09-19");
    expect(reference?.requiredTopics.map((topic) => topic.label)).toEqual([
      "temporary travel access",
      "verification",
      "Household update",
    ]);
    const result = await evaluateExactRun({
      question,
      answer: "Use temporary access and verify the TV [#1].",
      contexts: ["Use temporary access and verify through the account contact method."],
      reference,
      endpoint: "https://example.openai.azure.com",
      apiKey: "test-key",
      fetcher: async () => jsonResponse({
        faithfulness: 1,
        responseRelevancy: 1,
        contextPrecision: 1,
        contextRecall: 0.8,
        factualCorrectness: 0.85,
        reasons: {},
        unsupportedClaims: [],
        relevantContextIndices: [1],
      }),
    });
    expect(result.referenceId).toBe(reference?.id);
    expect(result.metrics.contextRecall).toBe(0.8);
    expect(result.metrics.factualCorrectness).toBe(0.85);
  });

  it("reports evaluator transport failure instead of fabricating scores", async () => {
    const result = await evaluateExactRun({
      question: "Question",
      answer: "Answer [#1].",
      contexts: ["Context"],
      endpoint: "https://example.openai.azure.com",
      apiKey: "test-key",
      fetcher: async () => new Response("unavailable", { status: 503 }),
    });
    expect(result.executed).toBe(false);
    expect(result.status).toBe("not-evaluated");
    expect(result.metrics.faithfulness).toBeNull();
    expect(result.error).toContain("503");
  });
});
