import json
from pathlib import Path

from ragas.metrics.collections import NonLLMStringSimilarity, StringPresence


ROOT = Path(__file__).resolve().parents[1]
DATASET = ROOT / "scripts" / "ragas_dataset.json"
OUTPUT = ROOT / "src" / "generated" / "ragas-evaluation.json"


def main() -> None:
    samples = json.loads(DATASET.read_text(encoding="utf-8"))
    similarity = NonLLMStringSimilarity()
    presence = StringPresence()
    similarity_scores = [
        similarity.score(reference=sample["reference"], response=sample["response"])
        for sample in samples
    ]
    presence_scores = [
        presence.score(reference=sample["required_phrase"], response=sample["response"])
        for sample in samples
    ]
    result = {
        "executed": True,
        "scope": "benchmark",
        "version": "0.4.3",
        "sampleCount": len(samples),
        "scores": {
            "non_llm_string_similarity": round(sum(similarity_scores) / len(similarity_scores), 4),
            "required_phrase_presence": round(sum(presence_scores) / len(presence_scores), 4),
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
