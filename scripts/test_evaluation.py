import asyncio
import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ragas = load("evaluate_fresh_ragas")
calibration = load("calibrate_judge")


class EvaluationTests(unittest.TestCase):
    def test_reference_free_metrics_do_not_use_pending_reference(self):
        class FakeMetric:
            async def ascore(self, **kwargs): return SimpleNamespace(value=.9)
        case = dict(question="q", answer="a", sources=[dict(text="context")])
        expected = dict(review=dict(status="pending"), reference="unreviewed")
        result = asyncio.run(ragas.score_case(case, expected, {name: FakeMetric() for name in ["ragas_faithfulness", "ragas_context_precision", "ragas_factual_correctness"]}))
        self.assertEqual(result[0]["value"], .9)
        self.assertIsNone(result[1]["value"])
        self.assertIsNone(result[3]["value"])

    def test_timeout_is_an_error_not_a_zero(self):
        class SlowMetric:
            async def ascore(self, **kwargs): await asyncio.sleep(1)
        case = dict(question="q", answer="a", sources=[dict(text="context")])
        expected = dict(review=dict(status="pending"), reference=None)
        result = asyncio.run(ragas.score_case(case, expected, {"ragas_faithfulness": SlowMetric()}, timeout=.01))
        self.assertEqual(result[0]["status"], "error")
        self.assertIsNone(result[0]["value"])

    def test_invalid_scores_and_empty_human_labels(self):
        self.assertEqual(ragas.record("m", 2, "evaluated")["status"], "error")
        self.assertEqual(calibration.calibrate([])["status"], "pending-human-labels")

    def test_missing_judgements_do_not_improve_error_rates(self):
        rows = [dict(split="held-out", reviewStatus="approved", humanDecision="fail", judgeDecision="pass"),
                dict(split="held-out", reviewStatus="approved", humanDecision="fail", judgeDecision="unavailable")]
        result = calibration.calibrate(rows)["splits"]["held-out"]
        self.assertEqual(result["falsePassRate"], 1)
        self.assertEqual(result["falsePassDenominator"], 1)
        self.assertEqual(result["unavailable"], 1)


if __name__ == "__main__": unittest.main()
