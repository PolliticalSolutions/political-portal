"""Synthetic tests for the aggregate-only Defect D local trial runner."""

import json

import local_row_trial as trial


def test_run_trial_compares_only_row_filter_and_writes_no_input_identity(
        monkeypatch, tmp_path):
    current = {
        "document_count": 1,
        "page_count": 10,
        "rows_before_deduplication": 10,
        "rows_after_deduplication": 10,
        "duplicate_rows_removed": 0,
        "voted_y": 6,
        "voted_n": 4,
        "postal_y": 0,
        "postal_n": 10,
        "unique_base_number_count": 10,
        "marked_bases_in_runs_of_five_or_more": 5,
        "longest_consecutive_marked_base_run": 5,
    }
    candidate = dict(current)
    candidate.update({
        "rows_after_deduplication": 9,
        "voted_y": 3,
        "voted_n": 6,
        "postal_n": 9,
        "unique_base_number_count": 9,
        "marked_bases_in_runs_of_five_or_more": 0,
        "longest_consecutive_marked_base_run": 2,
    })
    monkeypatch.setattr(trial.base, "_configure_local_binaries", lambda: None)
    monkeypatch.setattr(
        trial,
        "collect_ocr_runtime_versions",
        lambda **kwargs: {
            "tesseract": {"version": "tesseract 5.3.0"},
            "poppler": {"version": "pdftoppm version 22.12.0"},
        },
    )
    monkeypatch.setattr(
        trial,
        "_run_mode",
        lambda paths, row_filter, chunk_pages: (
            candidate if row_filter else current
        ),
    )

    private_path = tmp_path / "private-register.pdf"
    output_path = tmp_path / "aggregate.json"
    report = trial.run_trial([private_path], output_path)
    written = output_path.read_text(encoding="utf-8")

    assert "private-register" not in written
    assert str(private_path) not in written
    assert report["settings"]["gap_candidate_enabled_in_both_modes"] is True
    assert report["ocr_runtime"]["tesseract"]["version"] == "tesseract 5.3.0"
    assert report["candidate_minus_current"]["voted_y"] == -3
    assert json.loads(written)["candidate_row_eligibility"]["voted_y"] == 3
