"""Synthetic tests for the aggregate-only local OCR comparison runner."""

import json

import local_gap_trial as trial


def _row(number, voted="N", district="NAA"):
    return {
        "polling_district": district,
        "elector_number": number,
        "voted": voted,
        "postal_vote": "N",
    }


def test_marked_run_metrics_count_bases_not_subnumbers():
    rows = [
        _row("10", "Y"),
        _row("10/1", "Y"),
        _row("11", "Y"),
        _row("12", "Y"),
        _row("13", "Y"),
        _row("14", "Y"),
        _row("15", "N"),
        _row("16", "Y"),
    ]
    assert trial._marked_run_metrics(rows) == {
        "marked_bases_in_runs_of_five_or_more": 5,
        "longest_consecutive_marked_base_run": 5,
    }


def test_marked_runs_do_not_cross_districts():
    rows = [
        _row("10", "Y", "NAA"),
        _row("11", "Y", "NAA"),
        _row("12", "Y", "NAA"),
        _row("13", "Y", "NAB"),
        _row("14", "Y", "NAB"),
    ]
    assert trial._marked_run_metrics(rows) == {
        "marked_bases_in_runs_of_five_or_more": 0,
        "longest_consecutive_marked_base_run": 3,
    }


def test_range_summary_omits_elector_number_lists_and_issue_text():
    summary = trial._safe_range_summary(
        [{
            "district": "NAA",
            "start": 10,
            "end": 12,
            "captured_count": 2,
            "missing_count": 1,
            "missing": [11],
            "out_of_range_count": 1,
            "out_of_range": [13],
            "unparseable_count": 0,
            "unparseable": [],
        }],
        ["synthetic issue text"],
    )
    assert summary == {
        "districts": [{
            "district": "NAA",
            "declared_start": 10,
            "declared_end": 12,
            "unique_bases_observed_within_span": 2,
            "numbers_not_observed_count": 1,
            "observed_outside_span_count": 1,
            "unparseable_count": 0,
        }],
        "issue_count": 1,
    }
    assert "missing" not in json.dumps(summary)
    assert "synthetic issue text" not in json.dumps(summary)


def test_run_trial_writes_aggregate_report_without_input_identity(
        monkeypatch, tmp_path):
    baseline = {
        "document_count": 2,
        "page_count": 20,
        "rows_before_deduplication": 15,
        "rows_after_deduplication": 12,
        "duplicate_rows_removed": 3,
        "voted_y": 7,
        "voted_n": 5,
        "postal_y": 0,
        "postal_n": 12,
        "unique_base_number_count": 12,
        "marked_bases_in_runs_of_five_or_more": 5,
        "longest_consecutive_marked_base_run": 5,
    }
    candidate = dict(baseline)
    candidate.update({
        "rows_before_deduplication": 13,
        "rows_after_deduplication": 10,
        "voted_y": 5,
        "voted_n": 5,
        "postal_n": 10,
        "unique_base_number_count": 10,
        "marked_bases_in_runs_of_five_or_more": 0,
        "longest_consecutive_marked_base_run": 2,
    })
    monkeypatch.setattr(trial, "_configure_local_binaries", lambda: None)
    monkeypatch.setattr(
        trial,
        "_run_mode",
        lambda pdf_path, evidence_only, chunk_pages: (
            candidate if evidence_only else baseline
        ),
    )

    input_path = tmp_path / "private-register-name.pdf"
    output_path = tmp_path / "aggregate.json"
    report = trial.run_trial([input_path, tmp_path / "second.pdf"], output_path)
    written = output_path.read_text(encoding="utf-8")

    assert "private-register-name" not in written
    assert str(input_path) not in written
    assert report["candidate_minus_baseline"]["voted_y"] == -2
    assert report["candidate_minus_baseline"]["rows_after_deduplication"] == -2
    assert report["baseline_legacy"]["document_count"] == 2


def test_run_mode_deduplicates_across_documents(monkeypatch, tmp_path):
    first_pdf = tmp_path / "first.pdf"
    second_pdf = tmp_path / "second.pdf"
    documents = {
        first_pdf: {
            "rows": [_row("10", "Y"), _row("11")],
            "range_reports": [],
            "range_issues": [],
            "inference_diagnostics": {
                "numeric_gap_rows_legacy_would_generate": 0,
                "explicit_strikethrough_rows_inferred": 0,
            },
            "page_count": 4,
        },
        second_pdf: {
            "rows": [_row("10", "Y")],
            "range_reports": [],
            "range_issues": [],
            "inference_diagnostics": {
                "numeric_gap_rows_legacy_would_generate": 0,
                "explicit_strikethrough_rows_inferred": 0,
            },
            "page_count": 5,
        },
    }
    monkeypatch.setattr(
        trial,
        "_process_document",
        lambda pdf_path, chunk_pages: documents[pdf_path],
    )

    summary = trial._run_mode(
        [first_pdf, second_pdf], evidence_only=True, chunk_pages=20
    )

    assert summary["document_count"] == 2
    assert summary["page_count"] == 9
    assert summary["rows_before_deduplication"] == 3
    assert summary["rows_after_deduplication"] == 2
    assert summary["duplicate_rows_removed"] == 1
