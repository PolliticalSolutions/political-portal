"""GDPR-safe labelled comparison for Defect C gap inference.

Every fixture contains synthetic elector numbers only. The comparison records
the declared numbering span, labelled and readable numbers, the two inference
mechanisms, classification errors, Voted=Y totals, and the non-mutating §5
declared-range diagnostics for both baseline and candidate output.
"""

from collections import Counter
import json
from pathlib import Path

import combine_register.handler as c
import process_register.handler as h


def _readable(elector_num, voted=False):
    return {
        "elector_num": elector_num,
        "main_num": int(elector_num.split("/")[0]),
        "voted": voted,
    }


def _strikethrough():
    return {
        "elector_num": None,
        "main_num": None,
        "voted": True,
        "is_strikethrough": True,
    }


SAFE_LABELLED_FIXTURES = [
    {
        "id": "legitimate_single_gap",
        "district": "NAA",
        "span": (10, 12),
        "expected": ["10", "12"],
        "entries": [_readable("10"), _readable("12")],
    },
    {
        "id": "visually_evidenced_strikethrough",
        "district": "NAA",
        "span": (10, 12),
        "expected": ["10", "11", "12"],
        "entries": [_readable("10"), _strikethrough(), _readable("12")],
    },
    {
        "id": "declared_span_not_starting_at_one",
        "district": "TH7",
        "span": (557, 560),
        "expected": ["557", "559"],
        "entries": [_readable("557"), _readable("559")],
    },
    {
        "id": "valid_subnumber",
        "district": "NAA",
        "span": (595, 596),
        "expected": ["595", "595/1", "596"],
        "entries": [
            _readable("595"), _readable("595/1", voted=True), _readable("596")
        ],
    },
    {
        "id": "late_registration_out_of_sequence",
        "district": "NAA",
        "span": (595, 603),
        "expected": ["600", "603", "595/1"],
        "entries": [
            _readable("600"), _readable("603"), _readable("595/1", voted=True)
        ],
    },
    {
        "id": "readable_out_of_range_preserved",
        "district": "NAA",
        "span": (10, 12),
        "expected": ["10", "13"],
        "entries": [_readable("10"), _readable("13", voted=True)],
    },
]


EXPECTED_COMPARISON = {
    "legitimate_single_gap": {
        "gap_rows": ["11"], "strikethrough_rows": [],
        "baseline_fp": 1, "baseline_fn": 0, "candidate_fp": 0, "candidate_fn": 0,
        "baseline_y": 1, "candidate_y": 0,
        "baseline_not_observed": [], "candidate_not_observed": [11],
        "baseline_out_of_range": [], "candidate_out_of_range": [],
    },
    "visually_evidenced_strikethrough": {
        "gap_rows": [], "strikethrough_rows": ["11"],
        "baseline_fp": 0, "baseline_fn": 0, "candidate_fp": 0, "candidate_fn": 0,
        "baseline_y": 1, "candidate_y": 1,
        "baseline_not_observed": [], "candidate_not_observed": [],
        "baseline_out_of_range": [], "candidate_out_of_range": [],
    },
    "declared_span_not_starting_at_one": {
        "gap_rows": ["558"], "strikethrough_rows": [],
        "baseline_fp": 1, "baseline_fn": 0, "candidate_fp": 0, "candidate_fn": 0,
        "baseline_y": 1, "candidate_y": 0,
        "baseline_not_observed": [560], "candidate_not_observed": [558, 560],
        "baseline_out_of_range": [], "candidate_out_of_range": [],
    },
    "valid_subnumber": {
        "gap_rows": [], "strikethrough_rows": [],
        "baseline_fp": 0, "baseline_fn": 0, "candidate_fp": 0, "candidate_fn": 0,
        "baseline_y": 1, "candidate_y": 1,
        "baseline_not_observed": [], "candidate_not_observed": [],
        "baseline_out_of_range": [], "candidate_out_of_range": [],
    },
    "late_registration_out_of_sequence": {
        "gap_rows": ["601", "602"], "strikethrough_rows": [],
        "baseline_fp": 2, "baseline_fn": 0, "candidate_fp": 0, "candidate_fn": 0,
        "baseline_y": 3, "candidate_y": 1,
        "baseline_not_observed": [596, 597, 598, 599],
        "candidate_not_observed": [596, 597, 598, 599, 601, 602],
        "baseline_out_of_range": [], "candidate_out_of_range": [],
    },
    "readable_out_of_range_preserved": {
        "gap_rows": ["11", "12"], "strikethrough_rows": [],
        "baseline_fp": 2, "baseline_fn": 0, "candidate_fp": 0, "candidate_fn": 0,
        "baseline_y": 3, "candidate_y": 1,
        "baseline_not_observed": [], "candidate_not_observed": [11, 12],
        "baseline_out_of_range": ["13"], "candidate_out_of_range": ["13"],
    },
}


def _subtract_rows(left, right):
    remaining = Counter(right)
    difference = []
    for value in left:
        if remaining[value]:
            remaining[value] -= 1
        else:
            difference.append(value)
    return difference


def _range_report(fixture, elector_numbers):
    start, end = fixture["span"]
    rows = [
        {
            "polling_district": fixture["district"],
            "elector_number": elector_number,
        }
        for elector_number in elector_numbers
    ]
    reports, issues = c.validate_rows_against_declared_ranges(
        rows,
        {
            fixture["district"]: {
                "district": fixture["district"],
                "start": start,
                "end": end,
            }
        },
    )
    assert issues == []
    return reports[0]


def _score_fixture(fixture):
    baseline_diagnostics = h._new_inference_diagnostics()
    candidate_diagnostics = h._new_inference_diagnostics()
    baseline = h._infer_missing_entries(
        fixture["entries"], 0,
        evidence_only_gap_inference=False,
        diagnostics=baseline_diagnostics,
    )
    candidate = h._infer_missing_entries(
        fixture["entries"], 0,
        evidence_only_gap_inference=True,
        diagnostics=candidate_diagnostics,
    )
    baseline_numbers = [row["elector_num"] for row in baseline]
    candidate_numbers = [row["elector_num"] for row in candidate]
    readable_numbers = [
        entry["elector_num"]
        for entry in fixture["entries"]
        if entry.get("main_num") is not None
    ]
    expected = set(fixture["expected"])
    baseline_report = _range_report(fixture, baseline_numbers)
    candidate_report = _range_report(fixture, candidate_numbers)

    return {
        "declared_district": fixture["district"],
        "declared_span": fixture["span"],
        "expected_labelled_elector_numbers": fixture["expected"],
        "readable_elector_numbers": readable_numbers,
        "gap_rows": _subtract_rows(baseline_numbers, candidate_numbers),
        "strikethrough_rows": _subtract_rows(candidate_numbers, readable_numbers),
        "baseline_fp": len(set(baseline_numbers) - expected),
        "baseline_fn": len(expected - set(baseline_numbers)),
        "candidate_fp": len(set(candidate_numbers) - expected),
        "candidate_fn": len(expected - set(candidate_numbers)),
        "baseline_y": sum(row["voted"] for row in baseline),
        "candidate_y": sum(row["voted"] for row in candidate),
        "baseline_not_observed": baseline_report["missing"],
        "candidate_not_observed": candidate_report["missing"],
        "baseline_out_of_range": baseline_report["out_of_range"],
        "candidate_out_of_range": candidate_report["out_of_range"],
        "baseline_diagnostics": baseline_diagnostics,
        "candidate_diagnostics": candidate_diagnostics,
    }


def test_safe_labelled_baseline_candidate_comparison():
    for fixture in SAFE_LABELLED_FIXTURES:
        report = _score_fixture(fixture)
        expected = EXPECTED_COMPARISON[fixture["id"]]

        assert report["declared_district"] == fixture["district"]
        assert report["declared_span"] == fixture["span"]
        assert report["expected_labelled_elector_numbers"] == fixture["expected"]
        assert report["readable_elector_numbers"] == [
            entry["elector_num"]
            for entry in fixture["entries"]
            if entry.get("main_num") is not None
        ]
        for key, value in expected.items():
            assert report[key] == value, f"{fixture['id']}: {key}"

        assert report["candidate_diagnostics"] == {
            "numeric_gap_rows_legacy_would_generate": len(expected["gap_rows"]),
            "explicit_strikethrough_rows_inferred": len(expected["strikethrough_rows"]),
        }
        assert report["baseline_diagnostics"] == report["candidate_diagnostics"]


def test_feature_flag_defaults_to_legacy_and_false_is_byte_identical(monkeypatch):
    monkeypatch.delenv(h.EVIDENCE_ONLY_GAP_INFERENCE_FLAG, raising=False)
    assert h._evidence_only_gap_inference_enabled() is False

    monkeypatch.setenv(h.EVIDENCE_ONLY_GAP_INFERENCE_FLAG, "false")
    rows = h._infer_missing_entries([_readable("10"), _readable("12")], 0)
    encoded = json.dumps(rows, separators=(",", ":")).encode("utf-8")
    assert encoded == (
        b'[{"elector_num":"10","voted":false},'
        b'{"elector_num":"11","voted":true},'
        b'{"elector_num":"12","voted":false}]'
    )


def test_enabled_feature_flag_suppresses_sequence_only_gap(monkeypatch):
    monkeypatch.setenv(h.EVIDENCE_ONLY_GAP_INFERENCE_FLAG, "true")
    rows = h._infer_missing_entries([_readable("10"), _readable("12")], 0)
    assert rows == [
        {"elector_num": "10", "voted": False},
        {"elector_num": "12", "voted": False},
    ]


def test_enabled_feature_flag_retains_anchored_strikethrough(monkeypatch):
    monkeypatch.setenv(h.EVIDENCE_ONLY_GAP_INFERENCE_FLAG, "true")
    rows = h._infer_missing_entries(
        [_readable("10"), _strikethrough(), _readable("12")], 0
    )
    assert rows == [
        {"elector_num": "10", "voted": False},
        {"elector_num": "11", "voted": True},
        {"elector_num": "12", "voted": False},
    ]


def test_enabled_feature_flag_skips_leading_unanchored_strikethrough(monkeypatch):
    monkeypatch.setenv(h.EVIDENCE_ONLY_GAP_INFERENCE_FLAG, "true")
    rows = h._infer_missing_entries([_strikethrough(), _readable("12")], 0)
    assert rows == [{"elector_num": "12", "voted": False}]


def test_repeated_gap_filling_is_consistent_with_long_consecutive_y_runs():
    readable_marked_anchors = [
        _readable(str(number), voted=True)
        for number in (10, 15, 20, 25, 30, 35, 40)
    ]
    baseline = h._infer_missing_entries(
        readable_marked_anchors, 0, evidence_only_gap_inference=False
    )
    candidate = h._infer_missing_entries(
        readable_marked_anchors, 0, evidence_only_gap_inference=True
    )

    assert len(baseline) == 31
    assert sum(row["voted"] for row in baseline) == 31
    assert len(candidate) == 7
    assert sum(row["voted"] for row in candidate) == 7


def test_ocr_metadata_records_counts_without_elector_content(monkeypatch):
    monkeypatch.setattr(h, "convert_from_path", lambda *args, **kwargs: [object()], raising=False)
    monkeypatch.setattr(
        h,
        "_extract_metadata",
        lambda image: ("01/05/2025", "NAA", "In Person", []),
    )
    monkeypatch.setattr(h, "_count_pages", lambda path: 3)

    def fake_serial(pdf_path, total_pages, constituency_name, election_date,
                    polling_district, vote_type, inference_diagnostics=None):
        inference_diagnostics["numeric_gap_rows_legacy_would_generate"] = 2
        inference_diagnostics["explicit_strikethrough_rows_inferred"] = 1
        return [{"elector_number": "synthetic"}]

    monkeypatch.setattr(h, "_ocr_serial", fake_serial)
    rows, meta, page_districts, page_ranges = h.ocr_pdf(
        "synthetic.pdf", "Synthetic", "Synthetic Election"
    )

    assert rows == [{"elector_number": "synthetic"}]
    assert page_districts == {}
    assert page_ranges == {}
    assert meta["inference_diagnostics"] == {
        "numeric_gap_rows_legacy_would_generate": 2,
        "explicit_strikethrough_rows_inferred": 1,
    }
    assert set(meta["inference_diagnostics"]) == set(h._INFERENCE_DIAGNOSTIC_KEYS)


def test_sam_template_keeps_candidate_default_off():
    template = Path(__file__).parents[2] / "template.yaml"
    text = template.read_text()
    assert 'OcrEvidenceOnlyGapInference:\n    Type: String\n    Default: "false"' in text
    assert (
        "OCR_EVIDENCE_ONLY_GAP_INFERENCE: "
        "!Ref OcrEvidenceOnlyGapInference"
    ) in text


def test_sam_prod_config_enables_candidate_explicitly():
    config = Path(__file__).parents[2] / "samconfig.toml"
    text = config.read_text()
    assert 'OcrEvidenceOnlyGapInference=\\"true\\"' in text
