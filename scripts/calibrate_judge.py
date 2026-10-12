"""Summarise frozen human labels versus recorded judge decisions; never generate human labels."""
import argparse
import json
from pathlib import Path


def calibrate(rows):
    splits = {}
    for split in ("development", "held-out"):
        accepted = [r for r in rows if r.get("split") == split and r.get("reviewStatus") == "approved" and r.get("humanDecision") in ("pass", "fail")]
        positives = [r for r in accepted if r["humanDecision"] == "pass"]
        negatives = [r for r in accepted if r["humanDecision"] == "fail"]
        evaluated_pos = [r for r in positives if r.get("judgeDecision") in ("pass", "fail")]
        evaluated_neg = [r for r in negatives if r.get("judgeDecision") in ("pass", "fail")]
        false_passes = sum(r.get("judgeDecision") == "pass" for r in evaluated_neg)
        false_failures = sum(r.get("judgeDecision") == "fail" for r in evaluated_pos)
        splits[split] = dict(reviewedCount=len(accepted), falsePasses=false_passes, falsePassDenominator=len(evaluated_neg),
                             falsePassRate=false_passes / len(evaluated_neg) if evaluated_neg else None,
                             falseFailures=false_failures, falseFailureDenominator=len(evaluated_pos),
                             falseFailureRate=false_failures / len(evaluated_pos) if evaluated_pos else None,
                             unavailable=len(accepted) - len(evaluated_neg) - len(evaluated_pos))
    return dict(status="measured" if any(s["reviewedCount"] for s in splits.values()) else "pending-human-labels", splits=splits)


if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("input"); p.add_argument("output")
    a = p.parse_args()
    result = calibrate(json.loads(Path(a.input).read_text(encoding="utf-8")))
    Path(a.output).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(result["status"])
