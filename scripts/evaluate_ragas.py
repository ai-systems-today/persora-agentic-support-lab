import json
from pathlib import Path

from ragas.metrics.collections import (
    BleuScore,
    CHRFScore,
    ExactMatch,
    NonLLMStringSimilarity,
    RougeScore,
    StringPresence,
)


ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "scripts" / "ragas_dataset.json"
OUTPUT = ROOT / "src" / "generated" / "ragas-evaluation.json"


def main() -> None:
    samples = json.loads(DATASET.read_text(encoding="utf-8"))
    metrics = {
        "non_llm_string_similarity": (NonLLMStringSimilarity(), "reference"),
        "required_phrase_presence": (StringPresence(), "required_phrase"),
        "exact_match": (ExactMatch(), "reference"),
        "bleu_score": (BleuScore(), "reference"),
        "chrf_score": (CHRFScore(), "reference"),
        "rouge_l": (RougeScore(rouge_type="rougeL"), "reference"),
    }

    def numeric(value: object) -> float:
        resolved = getattr(value, "value", value)
        return float(resolved)

    per_case = {sample["case_id"]: {} for sample in samples}
    scores = {}
    for name, (metric, reference_field) in metrics.items():
        values = []
        for sample in samples:
            value = numeric(metric.score(reference=sample[reference_field], response=sample["response"]))
            values.append(value)
            per_case[sample["case_id"]][name] = round(value, 4)
        scores[name] = round(sum(values) / len(values), 4)

    result = {
        "executed": True,
        "scope": "benchmark",
        "version": "0.4.3",
        "sampleCount": len(samples),
        "metricCount": len(metrics),
        "scores": scores,
        "cases": {
            sample["case_id"]: {
                "question": sample["question"],
                "scores": per_case[sample["case_id"]],
            }
            for sample in samples
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
