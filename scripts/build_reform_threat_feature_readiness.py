"""Build a readiness report for future Reform Threat empirical work."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path


OUTPUT_PATH = Path("artifacts") / "backtests" / "reform_threat_feature_readiness.json"


def build_readiness_payload() -> dict:
    generated_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    features = [
        {
            "feature_key": "conservative_majority_fragility",
            "classification": "historically_usable_analogue_safe",
            "why": "Core electoral fragility signal with strong historical continuity and low leakage risk.",
        },
        {
            "feature_key": "challenger_structure",
            "classification": "historically_usable_analogue_safe",
            "why": "Challenger competition can be measured from baseline-cycle electoral results.",
        },
        {
            "feature_key": "right_fragmentation_proxy",
            "classification": "historically_usable_analogue_safe",
            "why": "Can be proxied with analogue-safe right-fragmentation measures rather than literal modern Reform data.",
        },
        {
            "feature_key": "historical_ukip_style_proxy",
            "classification": "historically_usable_analogue_safe",
            "why": "Useful as a bridge feature if handled explicitly as an analogue rather than a direct substitute.",
        },
        {
            "feature_key": "local_organisational_strength_proxy",
            "classification": "incomplete_not_ready",
            "why": "Current local-government linkage and organisation coverage remain too partial for national empirical use.",
        },
        {
            "feature_key": "current_reform_vote_share",
            "classification": "current_only_directional",
            "why": "Politically relevant now, but not directly comparable across pre-Reform historical cycles.",
        },
        {
            "feature_key": "demographic_receptivity_proxy",
            "classification": "current_only_directional",
            "why": "Potentially useful, but historical comparability and cycle breadth remain limited.",
        },
        {
            "feature_key": "post_target_reclassification_signals",
            "classification": "high_leakage_risk",
            "why": "Any signal built from target-period outcomes or later reclassifications would contaminate backtests.",
        },
    ]
    return {
        "model_key": "reform_threat",
        "generated_at": generated_at,
        "summary": {
            "historically_usable_analogue_safe": 4,
            "current_only_directional": 2,
            "incomplete_not_ready": 1,
            "high_leakage_risk": 1,
        },
        "features": features,
        "governance_notes": [
            "This artifact is a readiness scaffold, not a live model output.",
            "Reform Threat should remain a directional/current-conditions model until analogue-safe empirical feature sets are broader.",
        ],
    }


def main() -> int:
    payload = build_readiness_payload()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"output_path": str(OUTPUT_PATH).replace("\\", "/"), "feature_count": len(payload["features"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
