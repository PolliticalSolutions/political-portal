"""Synthetic privacy and quality-gate tests for the full local validation."""

import json

import local_register_fix_validation as trial


def test_safe_row_summary_reports_only_aggregate_elector_formats():
    summary = trial._safe_row_summary([
        {
            "polling_district": "PD1",
            "elector_number": "10",
            "voted": "Y",
            "postal_vote": "N",
        },
        {
            "polling_district": "PD1",
            "elector_number": "10/141",
            "voted": "N",
            "postal_vote": "N",
        },
        {
            "polling_district": "PD1",
            "elector_number": "10/1000",
            "voted": "N",
            "postal_vote": "N",
        },
    ])

    assert summary["elector_number_format"] == {
        "base_only": 1,
        "slash_subnumber": 2,
        "suffix_0_to_9": 0,
        "suffix_10_to_99": 0,
        "suffix_100_to_999": 1,
        "suffix_1000_plus": 1,
        "invalid": 0,
    }
    assert "10/141" not in str(summary)


def test_validation_report_excludes_input_identity_and_elector_values(
        monkeypatch, tmp_path):
    private_path = tmp_path / "private-elector-register.pdf"
    output_path = tmp_path / "aggregate.json"
    row = {
        "_source_type": "pdf",
        "polling_district": "ECA",
        "elector_number": "SECRET/7",
        "voted": "Y",
        "postal_vote": "N",
    }
    resolution = {
        "trusted": True,
        "source": "Document 1",
        "issues": [],
    }
    document_summary = {
        "document": 1,
        "page_count": 10,
        "rows_before_deduplication": 1,
        "rows_after_deduplication": 1,
        "within_source_duplicates_removed": 0,
        "within_source_deduplication_pct": 0.0,
        "vote_type_chunk_classifications": {"In Person": 1},
        "district_resolution": resolution,
        "declared_numbering_review": {
            "trusted_range_count": 0,
            "range_report_count": 0,
            "issue_count": 0,
        },
        "inference_diagnostics": {},
        "elapsed_seconds": 0.1,
        "rows": 1,
        "voted_y": 1,
        "voted_n": 0,
        "postal_y": 0,
        "postal_n": 1,
        "polling_district_count": 1,
        "polling_district_row_counts": {"ECA": 1},
    }

    monkeypatch.setattr(trial.base, "_configure_local_binaries", lambda: None)
    monkeypatch.setattr(
        trial,
        "collect_ocr_runtime_versions",
        lambda **_kwargs: {
            "tesseract": {"version": "tesseract test"},
            "poppler": {"version": "poppler test"},
        },
    )
    monkeypatch.setattr(
        trial,
        "_process_document",
        lambda _path, _index, _chunk_pages, election_name=None: (
            [dict(row)],
            dict(document_summary),
            dict(resolution),
        ),
    )

    report = trial.run_validation([private_path], output_path)
    written = output_path.read_text(encoding="utf-8")

    assert report["aggregate"]["quality_gate"] == "PASS"
    assert report["aggregate"]["rows_after_deduplication"] == 1
    assert str(private_path) not in written
    assert "private-elector-register" not in written
    assert "SECRET/7" not in written
    assert report["settings"]["election_family"] == "unknown"
    assert json.loads(written)["documents"][0]["document"] == 1


def test_validation_passes_production_election_context_without_storing_label(
        monkeypatch, tmp_path):
    private_path = tmp_path / "private-register.pdf"
    output_path = tmp_path / "aggregate.json"
    seen = {}
    row = {
        "_source_type": "pdf",
        "polling_district": "ECA",
        "elector_number": "1",
        "voted": "N",
        "postal_vote": "N",
    }
    resolution = {"trusted": True, "source": "Document 1", "issues": []}
    summary = {
        "document": 1,
        "page_count": 1,
        "rows_before_deduplication": 1,
        "rows_after_deduplication": 1,
        "within_source_duplicates_removed": 0,
        "within_source_deduplication_pct": 0.0,
        "district_resolution": resolution,
        "rows": 1,
        "voted_y": 0,
        "voted_n": 1,
        "postal_y": 0,
        "postal_n": 1,
        "polling_district_count": 1,
        "polling_district_row_counts": {"ECA": 1},
    }

    monkeypatch.setattr(trial.base, "_configure_local_binaries", lambda: None)
    monkeypatch.setattr(
        trial,
        "collect_ocr_runtime_versions",
        lambda **_kwargs: {"tesseract": {}, "poppler": {}},
    )

    def process(_path, _index, _chunk_pages, election_name=None):
        seen["election_name"] = election_name
        return [dict(row)], dict(summary), dict(resolution)

    monkeypatch.setattr(trial, "_process_document", process)

    report = trial.run_validation(
        [private_path],
        output_path,
        election_name="2024 General Election",
    )
    written = output_path.read_text(encoding="utf-8")

    assert seen["election_name"] == "2024 General Election"
    assert report["settings"]["election_family"] == "parliamentary"
    assert "2024 General Election" not in written


def test_duplicate_shape_contains_counts_but_not_elector_keys():
    rows = [
        {
            "polling_district": "ECA",
            "elector_number": "PRIVATE/1",
            "page": 3,
            "voted": "N",
        },
        {
            "polling_district": "ECA",
            "elector_number": "PRIVATE/1",
            "page": 4,
            "voted": "Y",
        },
        {
            "polling_district": "ECA",
            "elector_number": "OTHER",
            "page": 4,
            "voted": "N",
        },
    ]

    report = trial._safe_duplicate_shape(rows)
    rendered = json.dumps(report)

    assert "PRIVATE/1" not in rendered
    assert "OTHER" not in rendered
    assert report["ECA"]["input_rows"] == 3
    assert report["ECA"]["duplicates_removed"] == 1
    assert report["ECA"]["duplicate_keys_on_adjacent_pages"] == 1
    assert report["ECA"]["duplicate_keys_with_subnumbers"] == 1
    assert report["ECA"]["duplicate_keys_with_voted_conflict"] == 1


def test_combined_validation_includes_xlsx_without_storing_identity(
        monkeypatch, tmp_path):
    private_pdf = tmp_path / "private-register.pdf"
    private_xlsx = tmp_path / "private-postal.xlsx"
    output_path = tmp_path / "aggregate.json"
    resolution = {"trusted": True, "source": "Document 1", "issues": []}
    pdf_row = {
        "_source_type": "pdf",
        "polling_district": "ECA",
        "elector_number": "PRIVATE-1",
        "voted": "N",
        "postal_vote": "N",
    }
    xlsx_row = {
        "_source_type": "csv",
        "polling_district": "ECA",
        "elector_number": "PRIVATE-1",
        "voted": "Y",
        "postal_vote": "Y",
    }
    pdf_summary = {
        "document": 1,
        "page_count": 1,
        "rows_before_deduplication": 1,
        "rows_after_deduplication": 1,
        "within_source_duplicates_removed": 0,
        "within_source_deduplication_pct": 0.0,
        "district_resolution": resolution,
        "rows": 1,
        "voted_y": 0,
        "voted_n": 1,
        "postal_y": 0,
        "postal_n": 1,
        "polling_district_count": 1,
        "polling_district_row_counts": {"ECA": 1},
    }

    monkeypatch.setattr(trial.base, "_configure_local_binaries", lambda: None)
    monkeypatch.setattr(
        trial,
        "collect_ocr_runtime_versions",
        lambda **_kwargs: {
            "tesseract": {"version": "test"},
            "poppler": {"version": "test"},
        },
    )
    monkeypatch.setattr(
        trial,
        "_process_document",
        lambda *_args, **_kwargs: (
            [dict(pdf_row)],
            dict(pdf_summary),
            dict(resolution),
        ),
    )
    monkeypatch.setattr(
        trial,
        "_process_tabular_document",
        lambda *_args: (
            [dict(xlsx_row)],
            {
                "document": 2,
                "source_format": "xlsx",
                "schema": "test",
                "rows": 1,
                "voted_y": 1,
                "voted_n": 0,
                "postal_y": 1,
                "postal_n": 0,
                "polling_district_count": 1,
                "polling_district_row_counts": {"ECA": 1},
            },
        ),
    )

    report = trial.run_validation(
        [private_pdf],
        output_path,
        xlsx_paths=[private_xlsx],
    )
    written = output_path.read_text(encoding="utf-8")

    assert report["aggregate"]["document_count"] == 2
    assert report["aggregate"]["cross_source_records_merged"] == 1
    assert report["aggregate"]["rows_after_deduplication"] == 1
    assert report["aggregate"]["voted_y"] == 1
    assert report["aggregate"]["postal_y"] == 1
    assert "private-register" not in written
    assert "private-postal" not in written
    assert "PRIVATE-1" not in written
