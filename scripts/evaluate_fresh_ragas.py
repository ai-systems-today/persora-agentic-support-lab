"""Official RAGAS 0.4.3 metrics on captured fresh answers; never a live score substitute."""
import argparse
import asyncio
import json
import math
import os
from pathlib import Path
from time import perf_counter


def record(name, value=None, status="not-evaluated", reason="", duration=None):
    if value is not None and (not math.isfinite(value) or not 0 <= value <= 1):
        value, status, reason = None, "error", "Invalid score rejected"
    return dict(name=name, value=value, unit="ratio", status=status,
                method="ragas-0.4.3-collections", reason=reason, durationMs=duration)


async def score_case(case, expected, metrics, timeout=45):
    question, answer = case["question"], case["answer"]
    contexts = [c["text"] for c in (case.get("evidence") or {}).get("contexts", []) if c.get("text")]
    if not contexts:
        contexts = [c["text"] for c in case.get("sources", []) if c.get("text")]
    approved = expected["review"]["status"] == "approved"
    reference = expected.get("reference") if approved else None
    jobs = {
        "ragas_faithfulness": dict(user_input=question, response=answer, retrieved_contexts=contexts),
        "ragas_context_precision": dict(user_input=question, reference=reference, retrieved_contexts=contexts),
        "ragas_context_recall": dict(user_input=question, reference=reference, retrieved_contexts=contexts),
        "ragas_factual_correctness": dict(response=answer, reference=reference),
        "ragas_answer_relevancy": dict(user_input=question, response=answer),
    }
    out = []
    for name, kwargs in jobs.items():
        reason = None
        if expected.get("category") == "policy" and name != "ragas_answer_relevancy":
            out.append(record(name, status="not-applicable", reason="Non-retrieval policy response; source and reference metrics do not apply"))
            continue
        if not answer: reason = "No generated answer"
        elif name != "ragas_answer_relevancy" and name != "ragas_factual_correctness" and not contexts: reason = "No captured contexts"
        elif "reference" in kwargs and not reference: reason = "Approved reference unavailable"
        elif name not in metrics: reason = "Evaluator or embedding credentials unavailable"
        if reason:
            out.append(record(name, reason=reason))
            continue
        started = perf_counter()
        try:
            result = await asyncio.wait_for(metrics[name].ascore(**kwargs), timeout)
            out.append(record(name, float(result.value), "evaluated",
                              "Scored the report's captured contexts; inspect contextOrigin and generatorContextCaptured for evidence scope",
                              round((perf_counter() - started) * 1000)))
        except Exception as error:
            # Never persist provider exception bodies, which may contain credentials or private input.
            out.append(record(name, status="error", reason=type(error).__name__, duration=round((perf_counter() - started) * 1000)))
    return out


def build_metrics():
    if not os.getenv("AZURE_OPENAI_API_KEY") or not os.getenv("AZURE_OPENAI_ENDPOINT") or not os.getenv("AZURE_OPENAI_DEPLOYMENT"):
        return {}
    from openai import AsyncAzureOpenAI
    from ragas.llms.base import llm_factory
    from ragas.metrics.collections import Faithfulness, ContextPrecision, ContextRecall, FactualCorrectness, AnswerRelevancy
    from ragas.embeddings.base import embedding_factory
    client = AsyncAzureOpenAI(api_key=os.environ["AZURE_OPENAI_API_KEY"], azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
                             api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"), max_retries=1, timeout=60)
    llm = llm_factory(os.environ["AZURE_OPENAI_DEPLOYMENT"], client=client, max_tokens=4096)
    metrics = {"ragas_faithfulness": Faithfulness(llm=llm), "ragas_context_precision": ContextPrecision(llm=llm),
               "ragas_context_recall": ContextRecall(llm=llm), "ragas_factual_correctness": FactualCorrectness(llm=llm)}
    if os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT"):
        embeddings = embedding_factory("openai", model=os.environ["AZURE_OPENAI_EMBEDDING_DEPLOYMENT"], client=client)
        metrics["ragas_answer_relevancy"] = AnswerRelevancy(llm=llm, embeddings=embeddings)
    return metrics


async def main(args):
    report_path = Path(args.report)
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("projection") == "public-summary": raise ValueError("Use private captured evidence; public summaries omit source passages")
    dataset = json.loads(Path(args.dataset).read_text(encoding="utf-8"))
    if report["scope"] != "fresh-application" or report["datasetVersion"] != dataset["version"]:
        raise ValueError("Report scope or dataset version mismatch")
    expected = {c["id"]: c for c in dataset["cases"]}
    metrics = build_metrics()
    report["officialEvaluator"] = dict(library="RAGAS", version="0.4.3", maxOutputTokens=4096, metricTimeoutSeconds=args.timeout, providerTimeoutSeconds=60)
    for case in report["cases"]:
        scores = await score_case(case, expected[case["caseId"]], metrics, args.timeout)
        case["metrics"] = [m for m in case["metrics"] if m["name"] not in {s["name"] for s in scores}] + scores
        temp = report_path.with_suffix(report_path.suffix + ".tmp")
        temp.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        temp.replace(report_path)
    print("Saved official RAGAS scores/statuses; run benchmark gate validation after scoring")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", required=True)
    parser.add_argument("--dataset", default="evaluation/dataset.json")
    parser.add_argument("--timeout", type=float, default=120)
    asyncio.run(main(parser.parse_args()))
