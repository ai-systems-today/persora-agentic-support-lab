"""Capture official source evidence privately, record provenance, invalidate stale reviews."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def main():
    dataset_path = ROOT / "evaluation/dataset.json"
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    directory = ROOT / "work/source-snapshots"
    directory.mkdir(parents=True, exist_ok=True)
    results = {}
    for source in [s for case in dataset["cases"] for s in case["sources"]]:
        url = source["url"]
        if url in results: continue
        if urlparse(url).hostname != "help.netflix.com": raise ValueError("Only official Netflix Help sources accepted")
        try:
            with urlopen(Request(url, headers={"User-Agent": "Persora source-review/1.0"}), timeout=20) as response:
                if urlparse(response.url).hostname != "help.netflix.com": raise ValueError("Source redirect left official domain")
                data = response.read(2_000_001)
                if len(data) > 2_000_000: raise ValueError("Source exceeds capture limit")
            digest = hashlib.sha256(data).hexdigest()
            filename = f"{url.rstrip('/').split('/')[-1]}-{digest[:12]}.html"
            (directory / filename).write_bytes(data)
            results[url] = dict(hash=digest, snapshot=f"work/source-snapshots/{filename}", fetchedAt=datetime.now(timezone.utc).isoformat(), locale="en; country condition must be reviewed", status="captured")
        except Exception as error:
            results[url] = dict(status="unavailable", reason=type(error).__name__)
    for case in dataset["cases"]:
        for source in case["sources"]:
            result = results[source["url"]]
            if result["status"] == "captured":
                if source.get("hash") != result["hash"]:
                    case["review"] = dict(status="pending", reviewer=None, reviewedAt=None)
                source.update(result)
    manifests = [{"url": url, **value} for url, value in sorted(results.items())]
    (directory / "manifest.json").write_text(json.dumps(manifests, indent=2) + "\n", encoding="utf-8")
    dataset["sourceVersion"] = hashlib.sha256(json.dumps([{k: r.get(k) for k in ("url", "hash", "status")} for r in manifests], sort_keys=True).encode()).hexdigest()
    dataset_path.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8")
    print(f"Sources captured: {sum(r['status'] == 'captured' for r in results.values())}/{len(results)}; reviews remain pending")


if __name__ == "__main__": main()
