import importlib.util
import json
from pathlib import Path


SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "local_trial"
    / "district_provenance_audit.py"
)
SPEC = importlib.util.spec_from_file_location("district_provenance_audit", SCRIPT)
audit = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(audit)


def _write_payload(path, *, rows, page_districts):
    payload = {
        "jobId": "job-1",
        "chunkIndex": 0,
        "pageDistricts": page_districts,
        "pageDeclaredRanges": {},
        "meta": {"polling_district": "LA", "source_type": "pdf"},
        "rows": rows,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_replays_corroborated_boundary_and_dedupes_without_leaking_rows(tmp_path):
    input_dir = tmp_path / "private-input"
    input_dir.mkdir()
    _write_payload(
        input_dir / "job-1-0000.json",
        page_districts={"3": "LA", "4": "LA", "5": "LB", "6": "LB"},
        rows=[
            {
                "page": 3,
                "polling_district": "LA",
                "elector_number": "SENSITIVE_ENO_A",
                "name": "SENSITIVE_PERSON_A",
                "address": "SENSITIVE_ADDRESS_A",
            },
            {
                "page": 5,
                "polling_district": "LA",
                "elector_number": "SENSITIVE_ENO_B",
                "name": "SENSITIVE_PERSON_B",
                "address": "SENSITIVE_ADDRESS_B",
            },
            {
                "page": 6,
                "polling_district": "LA",
                "elector_number": "SENSITIVE_ENO_B",
                "name": "SENSITIVE_PERSON_B",
                "address": "SENSITIVE_ADDRESS_B",
            },
        ],
    )

    report = audit.build_report(
        input_dir,
        {"job-1": "synthetic-register.pdf"},
        ["LB"],
        resolver_commit="0" * 40,
    )

    assert report["reproduction"] == {
        "source_jobs": [
            {
                "source": "synthetic-register.pdf",
                "job_id": "job-1",
                "chunks": 1,
                "chunk_indices": [0],
                "rows_before_global_dedupe": 3,
                "seed_district": "LA",
                "seed_disagreement": False,
                "row_page_count": 3,
                "recognised_header_pages": 3,
                "header_coverage_pct": 100.0,
                "accepted_district_count": 2,
                "unresolved_leading_pages": 0,
                "rows_with_untrusted_district": 0,
                "inference_diagnostics": {},
            }
        ],
        "rows_before_global_dedupe": 3,
        "duplicate_rows_removed": 1,
        "rows_after_global_dedupe": 2,
        "polling_district_count": 2,
    }
    district = report["districts"][0]
    assert district["district"] == "LB"
    assert district["rows_in_reproduced_final_output"] == 1
    assert district["sources"][0]["accepted_boundary_events"] == [
        {
            "page": 5,
            "from_district": "LA",
            "to_district": "LB",
            "corroborated_by_page": 6,
        }
    ]
    assert district["sources"][0]["source_fidelity_status"] == (
        "corroborated_printed_header"
    )
    assert district["elector_number_integrity"] == {
        "rows_checked_before_dedupe": 2,
        "rows_checked_after_dedupe": 1,
        "duplicate_rows_removed": 1,
        "blank_or_missing_count": 0,
        "canonical_text_count": 0,
        "noncanonical_count": 2,
        "date_like_count": 0,
        "slash_suffix_count": 0,
        "unique_main_number_count": 0,
        "main_numbers_with_multiple_records": 0,
        "main_number_span_size": 0,
        "unobserved_positions_within_span": 0,
        "observed_span_pct": 0.0,
        "interpretation": (
            "Structural diagnostic only; gaps may be legitimate and destination "
            "matching is not assessed."
        ),
    }

    serialised = json.dumps(report)
    assert "SENSITIVE_ENO" not in serialised
    assert "SENSITIVE_PERSON" not in serialised
    assert "SENSITIVE_ADDRESS" not in serialised


def test_rejects_missing_requested_job(tmp_path):
    try:
        audit.build_report(
            tmp_path,
            {"missing-job": "missing.pdf"},
            ["LA"],
            resolver_commit="0" * 40,
        )
    except ValueError as exc:
        assert "missing-job" in str(exc)
    else:
        raise AssertionError("Missing production jobs must fail closed")


def test_requires_exact_resolver_commit(tmp_path):
    try:
        audit.build_report(tmp_path, {}, ["LA"], resolver_commit="")
    except ValueError as exc:
        assert "resolver commit" in str(exc)
    else:
        raise AssertionError("Unversioned provenance must fail closed")
