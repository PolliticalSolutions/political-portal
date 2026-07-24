"""Synthetic tests for privacy-safe CSV ingestion.

Fixtures deliberately contain no real elector data, names, addresses, or dates
of birth.
"""

import csv
import io
import json
from pathlib import Path

import pytest

import process_register.handler as h


def _write_csv(tmp_path, text, name="input.csv"):
    path = tmp_path / name
    path.write_bytes(text.encode("utf-8"))
    return path


def _marked_postal_report_text(
    register_refs=("PD1-47", "PD1-48/1"),
    *,
    title="Absent Voter Postal List Marked",
    private_detail="PRIVATE_DETAIL_REMOVED",
    delimiter=",",
    reported_total=None,
    footer_date="09/03/2026",
    page_marker="Page 1-of-1",
):
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, delimiter=delimiter, lineterminator="\r\n")

    def record(values):
        writer.writerow(list(values) + [""] * (9 - len(values)))

    record([title])
    writer.writerow(["", "", "", "", "", "Date", "", "", ""])
    record(["Synthetic election metadata"])
    record([])
    writer.writerow([
        "Reg. No",
        "",
        "Electors Name and Register Address\nPostal Address (if different)",
        "",
        "Ward",
        "",
        "",
        "",
        "",
    ])
    record([])
    record([])
    for register_ref in register_refs:
        writer.writerow([
            register_ref, "", "", "", "", "Synthetic Ward", "", "", "",
        ])
        record([])
        record([private_detail])
        record([])
    record([])
    if reported_total is None:
        reported_total = str(len(register_refs))
    record([f"Total Number of Postal Voters {reported_total}"])
    record([])
    writer.writerow([
        footer_date, "", "", "", "", "", "", "", page_marker,
    ])
    return buffer.getvalue()


class TestAbsentVoterCsvParsing:
    def test_maps_useful_fields_and_discards_unrelated_columns(self, tmp_path):
        path = _write_csv(
            tmp_path,
            "\ufeffCompanyName,DistrictRef,PropertyFullAddress,"
            "ElectorShortNumber,MarkerPostal,ElectorDOB\r\n"
            "Synthetic Council,PD1,REMOVED,47/1,TRUE,REMOVED\r\n",
        )

        rows, meta = h._parse_uploaded_csv(
            path, "Test Constituency", "01/05/2026"
        )

        assert rows == [{
            "election_date": "01/05/2026",
            "constituency": "Test Constituency",
            "polling_district": "PD1",
            "elector_number": "47/1",
            "voted": "N",
            "postal_vote": "Y",
        }]
        assert "REMOVED" not in json.dumps(rows)
        assert meta["source_type"] == "csv"
        assert meta["csv_schema"] == "absent_voters_v1"
        assert meta["rows_read"] == 1
        assert meta["postal_rows"] == 1

    def test_header_order_case_and_separators_are_normalised(self, tmp_path):
        path = _write_csv(
            tmp_path,
            "marker_postal,elector short number,DISTRICT REF\n"
            " false ,12, pd2 \n",
        )
        rows, _ = h._parse_uploaded_csv(path, "Test", "Date")
        assert rows[0]["polling_district"] == "PD2"
        assert rows[0]["elector_number"] == "12"
        assert rows[0]["voted"] == "N"
        assert rows[0]["postal_vote"] == "N"

    @pytest.mark.parametrize("delimiter", [",", ";", "\t", "|"])
    def test_supported_delimiters(self, tmp_path, delimiter):
        path = _write_csv(
            tmp_path,
            delimiter.join(["DistrictRef", "ElectorShortNumber", "MarkerPostal"])
            + "\n"
            + delimiter.join(["PD1", "47/2", "TRUE"])
            + "\n",
        )
        rows, _ = h._parse_uploaded_csv(path, "Test", "Date")
        assert rows[0]["elector_number"] == "47/2"

    def test_header_only_is_rejected(self, tmp_path):
        path = _write_csv(
            tmp_path, "DistrictRef,ElectorShortNumber,MarkerPostal\n"
        )
        with pytest.raises(h.CsvInputError, match="CSV_EMPTY"):
            h._parse_uploaded_csv(path, "Test", "Date")

    def test_missing_required_header_is_rejected_without_echoing_headers(self, tmp_path):
        path = _write_csv(
            tmp_path, "DistrictRef,ElectorShortNumber\nPD1,1\n"
        )
        with pytest.raises(h.CsvInputError) as exc:
            h._parse_uploaded_csv(path, "Test", "Date")
        assert exc.value.code == "CSV_HEADER_UNRECOGNISED"
        assert "DistrictRef" not in str(exc.value)

    def test_duplicate_normalised_heading_is_rejected(self, tmp_path):
        path = _write_csv(
            tmp_path,
            "DistrictRef,District Ref,ElectorShortNumber,MarkerPostal\n"
            "PD1,PD1,1,TRUE\n",
        )
        with pytest.raises(h.CsvInputError, match="CSV_HEADER_INVALID"):
            h._parse_uploaded_csv(path, "Test", "Date")

    def test_invalid_marker_is_aggregate_only(self, tmp_path):
        path = _write_csv(
            tmp_path,
            "DistrictRef,ElectorShortNumber,MarkerPostal\n"
            "PD1,1,PRIVATE_SENTINEL\n",
        )
        with pytest.raises(h.CsvInputError) as exc:
            h._parse_uploaded_csv(path, "Test", "Date")
        assert exc.value.code == "CSV_ROW_INVALID"
        assert "PRIVATE_SENTINEL" not in str(exc.value)
        assert "rows with invalid MarkerPostal: 1" in str(exc.value)

    def test_wrong_width_fails_the_whole_file(self, tmp_path):
        path = _write_csv(
            tmp_path,
            "DistrictRef,ElectorShortNumber,MarkerPostal\n"
            "PD1,1,TRUE,EXTRA\n",
        )
        with pytest.raises(h.CsvInputError, match="wrong-width rows: 1"):
            h._parse_uploaded_csv(path, "Test", "Date")

    def test_duplicate_district_elector_key_is_rejected(self, tmp_path):
        path = _write_csv(
            tmp_path,
            "DistrictRef,ElectorShortNumber,MarkerPostal\n"
            "PD1,47/1,TRUE\n"
            "PD1,47/1,TRUE\n",
        )
        with pytest.raises(h.CsvInputError, match="duplicate district/elector keys: 1"):
            h._parse_uploaded_csv(path, "Test", "Date")

    @pytest.mark.parametrize(
        ("constituency", "election_date"),
        [("", "Date"), ("Test", "")],
    )
    def test_form_metadata_is_required(
        self, tmp_path, constituency, election_date
    ):
        path = _write_csv(
            tmp_path,
            "DistrictRef,ElectorShortNumber,MarkerPostal\nPD1,1,TRUE\n",
        )
        with pytest.raises(h.CsvInputError, match="CSV_METADATA_MISSING"):
            h._parse_uploaded_csv(path, constituency, election_date)

    def test_file_at_configured_size_boundary_is_accepted(
        self, tmp_path, monkeypatch
    ):
        text = "DistrictRef,ElectorShortNumber,MarkerPostal\nPD1,1,TRUE\n"
        path = _write_csv(tmp_path, text)
        monkeypatch.setattr(h, "CSV_MAX_BYTES", path.stat().st_size)
        rows, _ = h._parse_uploaded_csv(path, "Test", "Date")
        assert len(rows) == 1

    def test_file_above_configured_size_boundary_is_rejected(
        self, tmp_path, monkeypatch
    ):
        text = "DistrictRef,ElectorShortNumber,MarkerPostal\nPD1,1,TRUE\n"
        path = _write_csv(tmp_path, text)
        monkeypatch.setattr(h, "CSV_MAX_BYTES", path.stat().st_size - 1)
        with pytest.raises(h.CsvInputError, match="CSV_TOO_LARGE"):
            h._parse_uploaded_csv(path, "Test", "Date")


class TestMarkedPostalReportParsing:
    def test_maps_register_reference_and_discards_private_detail(self, tmp_path):
        path = _write_csv(
            tmp_path,
            _marked_postal_report_text(),
        )

        rows, meta = h._parse_uploaded_csv(
            path, "Test Constituency", "01/05/2026"
        )

        assert rows == [
            {
                "election_date": "01/05/2026",
                "constituency": "Test Constituency",
                "polling_district": "PD1",
                "elector_number": "47",
                "voted": "N",
                "postal_vote": "Y",
            },
            {
                "election_date": "01/05/2026",
                "constituency": "Test Constituency",
                "polling_district": "PD1",
                "elector_number": "48/1",
                "voted": "N",
                "postal_vote": "Y",
            },
        ]
        rendered = json.dumps({"rows": rows, "meta": meta})
        assert "PRIVATE_DETAIL_REMOVED" not in rendered
        assert "Synthetic Ward" not in rendered
        assert meta["source_type"] == "csv"
        assert meta["csv_schema"] == "marked_postal_report_v1"
        assert meta["rows_read"] == 2
        assert meta["postal_rows"] == 2

    def test_utf8_bom_and_multiline_heading_are_supported(self, tmp_path):
        path = _write_csv(
            tmp_path,
            "\ufeff" + _marked_postal_report_text(register_refs=("PD2-1",)),
        )
        rows, _ = h._parse_uploaded_csv(path, "Test", "Date")
        assert rows[0]["polling_district"] == "PD2"

    def test_report_profile_requires_exact_title(self, tmp_path):
        path = _write_csv(
            tmp_path,
            _marked_postal_report_text(title="Different report"),
        )
        with pytest.raises(h.CsvInputError, match="CSV_HEADER_UNRECOGNISED"):
            h._parse_uploaded_csv(path, "Test", "Date")

    def test_report_profile_is_comma_only(self, tmp_path):
        path = _write_csv(
            tmp_path,
            _marked_postal_report_text(delimiter=";"),
        )
        with pytest.raises(h.CsvInputError, match="CSV_HEADER_UNRECOGNISED"):
            h._parse_uploaded_csv(path, "Test", "Date")

    def test_report_heading_positions_are_strict(self, tmp_path):
        text = _marked_postal_report_text().replace(
            ",Ward,", ",Different heading,", 1
        )
        path = _write_csv(tmp_path, text)
        with pytest.raises(h.CsvInputError, match="CSV_REPORT_INVALID"):
            h._parse_uploaded_csv(path, "Test", "Date")

    def test_invalid_register_reference_is_aggregate_only(self, tmp_path):
        path = _write_csv(
            tmp_path,
            _marked_postal_report_text(
                register_refs=("PRIVATE_REFERENCE_SENTINEL",),
            ),
        )
        with pytest.raises(h.CsvInputError) as exc:
            h._parse_uploaded_csv(path, "Test", "Date")
        assert exc.value.code == "CSV_ROW_INVALID"
        assert "PRIVATE_REFERENCE_SENTINEL" not in str(exc.value)
        assert "rows with invalid register references: 1" in str(exc.value)

    def test_duplicate_register_key_is_rejected(self, tmp_path):
        path = _write_csv(
            tmp_path,
            _marked_postal_report_text(
                register_refs=("PD1-47/1", "PD1-47/1"),
            ),
        )
        with pytest.raises(h.CsvInputError, match="duplicate district/elector keys: 1"):
            h._parse_uploaded_csv(path, "Test", "Date")

    @pytest.mark.parametrize("reported_total", ["1", "not-a-number"])
    def test_reported_total_must_match_data_blocks(
        self, tmp_path, reported_total
    ):
        path = _write_csv(
            tmp_path,
            _marked_postal_report_text(reported_total=reported_total),
        )
        with pytest.raises(h.CsvInputError, match="CSV_REPORT_INVALID"):
            h._parse_uploaded_csv(path, "Test", "Date")

    @pytest.mark.parametrize(
        ("footer_date", "page_marker"),
        [
            ("Generated today", "Page 1-of-1"),
            ("09/03/2026", "Not a page marker"),
            ("09/03/2026", "Page 1-of-2"),
        ],
    )
    def test_report_footer_labels_are_strict(
        self, tmp_path, footer_date, page_marker
    ):
        path = _write_csv(
            tmp_path,
            _marked_postal_report_text(
                footer_date=footer_date,
                page_marker=page_marker,
            ),
        )
        with pytest.raises(h.CsvInputError, match="CSV_REPORT_INVALID"):
            h._parse_uploaded_csv(path, "Test", "Date")

    def test_incomplete_data_block_is_rejected_without_detail_value(
        self, tmp_path
    ):
        text = _marked_postal_report_text(
            register_refs=("PD1-47",),
            private_detail="PRIVATE_DETAIL_SENTINEL",
        )
        # Delete the final field separator from the private-detail record,
        # producing a wrong-width logical record without exposing its value.
        text = text.replace(
            "PRIVATE_DETAIL_SENTINEL,,,,,,,,\r\n",
            "PRIVATE_DETAIL_SENTINEL\r\n",
        )
        path = _write_csv(tmp_path, text)
        with pytest.raises(h.CsvInputError) as exc:
            h._parse_uploaded_csv(path, "Test", "Date")
        assert exc.value.code == "CSV_REPORT_INVALID"
        assert "PRIVATE_DETAIL_SENTINEL" not in str(exc.value)


class _FakeS3:
    def __init__(self, source_text=None, download_error=None, head_size=None):
        self.source_text = source_text
        self.download_error = download_error
        self.head_size = head_size
        self.downloads = 0
        self.puts = []

    def download_file(self, bucket, key, destination):
        if self.download_error:
            raise self.download_error
        self.downloads += 1
        Path(destination).write_bytes(self.source_text.encode("utf-8"))

    def head_object(self, **_kwargs):
        if self.download_error:
            raise self.download_error
        size = (
            self.head_size
            if self.head_size is not None
            else len(self.source_text.encode("utf-8"))
        )
        return {"ContentLength": size}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


def _csv_job():
    return {
        "jobId": "job-1",
        "fileType": "csv",
        "userSub": "user-1",
        "batchId": "batch-1",
        "totalFilesInBatch": 1,
        "association": "Test Association",
        "constituency": "Test Constituency",
        "councilArea": "Test Council",
        "election": "Test Election",
        "electionDate": "01/05/2026",
    }


def _event(receive_count="1"):
    return {
        "Records": [{
            "messageId": "message-1",
            "body": json.dumps({
                "jobId": "job-1",
                "bucket": "input-bucket",
                "s3Key": "uploads/user-1/job-1/input.csv",
            }),
            "attributes": {"ApproximateReceiveCount": receive_count},
        }]
    }


class TestCsvHandlerDispatch:
    def _arrange(self, monkeypatch, fake_s3):
        finalised = []
        monkeypatch.setattr(h, "OCR_AVAILABLE", False)
        monkeypatch.setattr(h, "s3_client", fake_s3)
        monkeypatch.setattr(h, "get_job", lambda _job_id: _csv_job())
        monkeypatch.setattr(h, "_ensure_single_chunk_tracker", lambda _job_id: None)
        monkeypatch.setattr(
            h, "try_finalise_job",
            lambda *args, **kwargs: finalised.append((args, kwargs)),
        )
        monkeypatch.setattr(
            h, "run_splitter",
            lambda *_args, **_kwargs: pytest.fail("CSV reached the PDF splitter"),
        )
        monkeypatch.setattr(
            h, "ocr_pdf",
            lambda *_args, **_kwargs: pytest.fail("CSV reached OCR"),
        )
        return finalised

    def test_csv_bypasses_ocr_and_writes_normalised_json(
        self, monkeypatch
    ):
        fake_s3 = _FakeS3(
            "DistrictRef,ElectorShortNumber,MarkerPostal\nPD1,47/1,TRUE\n"
        )
        finalised = self._arrange(monkeypatch, fake_s3)

        result = h.handler(_event(), None)

        assert result == {"batchItemFailures": []}
        assert len(fake_s3.puts) == 1
        payload = json.loads(fake_s3.puts[0]["Body"])
        assert payload["meta"]["source_type"] == "csv"
        assert payload["rows"][0] == {
            "election_date": "01/05/2026",
            "constituency": "Test Constituency",
            "polling_district": "PD1",
            "elector_number": "47/1",
            "voted": "N",
            "postal_vote": "Y",
        }
        assert finalised[0][1]["chunk_failed"] is False

    def test_marked_postal_report_uses_the_same_direct_csv_path(
        self, monkeypatch
    ):
        fake_s3 = _FakeS3(
            _marked_postal_report_text(register_refs=("PD1-47/1",))
        )
        finalised = self._arrange(monkeypatch, fake_s3)

        result = h.handler(_event(), None)

        assert result == {"batchItemFailures": []}
        assert len(fake_s3.puts) == 1
        payload = json.loads(fake_s3.puts[0]["Body"])
        assert payload["meta"]["csv_schema"] == "marked_postal_report_v1"
        assert payload["rows"] == [{
            "election_date": "01/05/2026",
            "constituency": "Test Constituency",
            "polling_district": "PD1",
            "elector_number": "47/1",
            "voted": "N",
            "postal_vote": "Y",
        }]
        assert "PRIVATE_DETAIL_REMOVED" not in fake_s3.puts[0]["Body"]
        assert finalised[0][1]["chunk_failed"] is False

    def test_invalid_csv_settles_as_failed_without_upload(
        self, monkeypatch
    ):
        fake_s3 = _FakeS3("Unrecognised,Headers\none,two\n")
        finalised = self._arrange(monkeypatch, fake_s3)

        result = h.handler(_event(), None)

        assert result == {"batchItemFailures": []}
        assert fake_s3.puts == []
        assert finalised[0][1]["chunk_failed"] is True
        assert "CSV_HEADER_UNRECOGNISED" in finalised[0][1]["failure_reason"]

    def test_infrastructure_failure_returns_message_for_retry(
        self, monkeypatch
    ):
        fake_s3 = _FakeS3(download_error=RuntimeError("temporary S3 failure"))
        finalised = self._arrange(monkeypatch, fake_s3)

        result = h.handler(_event(), None)

        assert result == {
            "batchItemFailures": [{"itemIdentifier": "message-1"}]
        }
        assert finalised == []

    def test_oversize_object_is_rejected_before_download(
        self, monkeypatch
    ):
        fake_s3 = _FakeS3(
            "DistrictRef,ElectorShortNumber,MarkerPostal\nPD1,1,TRUE\n",
            head_size=101,
        )
        finalised = self._arrange(monkeypatch, fake_s3)
        monkeypatch.setattr(h, "CSV_MAX_BYTES", 100)

        result = h.handler(_event(), None)

        assert result == {"batchItemFailures": []}
        assert fake_s3.downloads == 0
        assert fake_s3.puts == []
        assert finalised[0][1]["chunk_failed"] is True
        assert "CSV_TOO_LARGE" in finalised[0][1]["failure_reason"]

    def test_terminal_success_redelivery_does_not_become_failed(
        self, monkeypatch
    ):
        fake_s3 = _FakeS3(
            "DistrictRef,ElectorShortNumber,MarkerPostal\nPD1,1,TRUE\n"
        )
        finalised = self._arrange(monkeypatch, fake_s3)
        terminal_job = {**_csv_job(), "status": "SUCCEEDED"}
        monkeypatch.setattr(h, "get_job", lambda _job_id: terminal_job)

        result = h.handler(_event(receive_count="3"), None)

        assert result == {"batchItemFailures": []}
        assert fake_s3.puts == []
        assert finalised[0][1]["chunk_failed"] is False

    def test_settled_success_at_receive_limit_resumes_without_reprocessing(
        self, monkeypatch
    ):
        fake_s3 = _FakeS3(
            "DistrictRef,ElectorShortNumber,MarkerPostal\nPD1,1,TRUE\n"
        )
        finalised = self._arrange(monkeypatch, fake_s3)
        monkeypatch.setattr(
            h,
            "_ensure_single_chunk_tracker",
            lambda _job_id: {"settledChunks": {0}},
        )

        result = h.handler(_event(receive_count="3"), None)

        assert result == {"batchItemFailures": []}
        assert fake_s3.puts == []
        assert finalised[0][1]["chunk_failed"] is False

    def test_get_job_failure_returns_message_for_retry(self, monkeypatch):
        fake_s3 = _FakeS3(
            "DistrictRef,ElectorShortNumber,MarkerPostal\nPD1,1,TRUE\n"
        )
        monkeypatch.setattr(h, "OCR_AVAILABLE", False)
        monkeypatch.setattr(h, "s3_client", fake_s3)
        monkeypatch.setattr(
            h, "get_job",
            lambda _job_id: (_ for _ in ()).throw(
                RuntimeError("temporary DynamoDB failure")
            ),
        )

        result = h.handler(_event(), None)

        assert result == {
            "batchItemFailures": [{"itemIdentifier": "message-1"}]
        }
        assert fake_s3.puts == []
