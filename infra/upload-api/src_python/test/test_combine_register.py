"""Unit tests for the pure functions of the marked-register combiner.

The district resolver (§6.3 / §6.4) is the riskiest new logic in this change and
is pure logic over a page->district map and elector ranges, so it is tested here
directly with synthetic inputs — no Tesseract, no AWS. Test 1b in the spec calls
out exactly these cases: single district, clean two-district split, unreadable
second header, blank page mid-document, and 47/1-style sub-numbered electors.
"""

import combine_register.handler as c


def _rows(pairs, seed="SEED"):
    """Build rows from (page, elector_number) pairs, all pre-tagged with a seed
    district as the worker would write them."""
    return [
        {"page": page, "elector_number": en, "polling_district": seed,
         "voted": "Y", "election_date": "", "constituency": "", "postal_vote": "N"}
        for page, en in pairs
    ]


def _districts(rows):
    return [r["polling_district"] for r in rows]


# ── _elector_main_number (§6.3) ───────────────────────────────────────────────

class TestElectorMainNumber:
    def test_plain_number(self):
        assert c._elector_main_number("47") == 47

    def test_sub_number_takes_part_before_slash(self):
        # Must NOT become 471 (the _sort_key re.sub approach would do that).
        assert c._elector_main_number("47/1") == 47

    def test_none(self):
        assert c._elector_main_number(None) is None

    def test_empty(self):
        assert c._elector_main_number("") is None

    def test_non_numeric(self):
        assert c._elector_main_number("abc") is None

    def test_whitespace(self):
        assert c._elector_main_number(" 47 ") == 47


# ── resolve_job_districts (§6.3 / §6.4) ───────────────────────────────────────

class TestResolveJobDistricts:
    def test_single_district_no_signal_returns_seed_everywhere(self):
        """Invariant 1/7: no per-page signal → every row gets the seed."""
        rows = _rows([(3, "1"), (3, "2"), (4, "3"), (4, "4")])
        synthetic = c.resolve_job_districts(rows, {}, "LA")
        assert set(_districts(rows)) == {"LA"}
        assert synthetic == set()

    def test_clean_two_district_split_with_headers(self):
        rows = _rows([(3, "10"), (3, "55"), (4, "56"), (4, "60"),
                      (5, "1"), (5, "5"), (6, "6"), (6, "40")])
        page_districts = {"3": "LA", "4": "LA", "5": "LB", "6": "LB"}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        assert _districts(rows) == ["LA", "LA", "LA", "LA", "LB", "LB", "LB", "LB"]
        assert synthetic == set()

    def test_header_corroboration_without_reset(self):
        """Layer (a) alone: a different code on two consecutive pages, no reset."""
        rows = _rows([(3, "10"), (3, "55"), (4, "56"), (4, "60"), (5, "61"), (5, "70")])
        page_districts = {"3": "LA", "4": "LB", "5": "LB"}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        # Boundary lands on the first page of the two-page LB run (page 4).
        assert _districts(rows) == ["LA", "LA", "LB", "LB", "LB", "LB"]
        assert synthetic == set()

    def test_one_off_header_noise_is_suppressed(self):
        """A single stray code (not on two consecutive pages) must not split."""
        rows = _rows([(3, "10"), (3, "20"), (4, "21"), (4, "30"), (5, "31"), (5, "40")])
        page_districts = {"3": "LA", "4": "LX", "5": "LA"}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        assert set(_districts(rows)) == {"LA"}
        assert synthetic == set()

    def test_unreadable_second_header_triggers_synthetic_via_reset(self):
        """Layer (b): elector reset fires even when the header is unreadable."""
        rows = _rows([(3, "10"), (3, "55"), (4, "56"), (4, "60"),
                      (5, "1"), (5, "5"), (6, "6"), (6, "40")])
        page_districts = {"3": "LA", "4": "LA", "5": None, "6": None}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        assert _districts(rows) == ["LA", "LA", "LA", "LA", "LA-2", "LA-2", "LA-2", "LA-2"]
        assert synthetic == {"LA-2"}

    def test_reset_prefers_real_header_code_over_synthetic(self):
        """If a usable header code is present when (b) fires, use it, not a label."""
        rows = _rows([(3, "55"), (4, "60"), (5, "1"), (6, "40")])
        page_districts = {"3": "LA", "4": "LA", "5": "LB", "6": "LB"}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        assert _districts(rows) == ["LA", "LA", "LB", "LB"]
        assert synthetic == set()

    def test_blank_page_mid_document_is_not_a_boundary(self):
        """A page with no rows must not reset the running max (§6.3)."""
        rows = _rows([(3, "10"), (3, "55"), (4, "56"), (4, "60"), (6, "61"), (6, "70")])
        page_districts = {"3": "LA", "4": "LA", "5": "LA", "6": "LA"}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        assert set(_districts(rows)) == {"LA"}
        assert synthetic == set()

    def test_sub_numbered_electors_do_not_manufacture_reset(self):
        rows = _rows([(3, "47"), (3, "47/1"), (3, "48"), (4, "49"), (4, "50")])
        page_districts = {"3": "LA", "4": "LA"}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        assert set(_districts(rows)) == {"LA"}
        assert synthetic == set()

    def test_multiple_resets_increment_synthetic_labels(self):
        rows = _rows([(3, "10"), (3, "55"), (4, "56"), (4, "60"),
                      (5, "1"), (5, "5"), (6, "6"), (6, "60"),
                      (7, "1"), (7, "5"), (8, "6"), (8, "40")])
        page_districts = {str(p): None for p in range(3, 9)}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        assert synthetic == {"LA-2", "LA-3"}
        by_page = {r["page"]: r["polling_district"] for r in rows}
        assert by_page[3] == "LA"
        assert by_page[5] == "LA-2"
        assert by_page[7] == "LA-3"

    def test_single_spurious_low_outlier_does_not_trigger_boundary(self):
        # Page 4 is a normal continuation (high numbers) but OCR misread one entry
        # as "1". A min-based rule would fake a reset here; the median-based rule
        # must not, because the page's median is still high.
        rows = _rows([
            (3, "400"), (3, "405"), (3, "410"), (3, "415"), (3, "420"),
            (4, "1"), (4, "425"), (4, "430"), (4, "435"), (4, "440"),
        ])
        page_districts = {"3": "LA", "4": "LA"}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        assert set(_districts(rows)) == {"LA"}
        assert synthetic == set()

    def test_genuine_full_reset_still_triggers(self):
        # Page 4 is a real new district: every number drops from the ~400s to the
        # low tens, so the median collapses and the reset must be accepted.
        rows = _rows([
            (3, "450"), (3, "460"), (3, "470"), (3, "480"), (3, "490"),
            (4, "1"), (4, "5"), (4, "10"), (4, "15"), (4, "20"),
        ])
        page_districts = {"3": "LA", "4": None}
        synthetic = c.resolve_job_districts(rows, page_districts, "LA")
        by_page = {r["page"]: r["polling_district"] for r in rows}
        assert by_page[3] == "LA"
        assert by_page[4] == "LA-2"
        assert synthetic == {"LA-2"}

    def test_empty_rows(self):
        assert c.resolve_job_districts([], {"3": "LA"}, "LA") == set()

    def test_rows_without_page_are_left_untouched(self):
        rows = [{"elector_number": "1", "polling_district": "LA"}]
        synthetic = c.resolve_job_districts(rows, {}, "SEED")
        # No page → not grouped → not reassigned.
        assert rows[0]["polling_district"] == "LA"
        assert synthetic == set()


# ── _dedupe_rows (§6.1 — the core bug this fixes) ─────────────────────────────

class TestDedupeRows:
    def test_cross_district_overlap_preserved(self):
        rows = [
            {"polling_district": "LA", "elector_number": "47"},
            {"polling_district": "LB", "elector_number": "47"},
        ]
        out = c._dedupe_rows(rows)
        assert len(out) == 2

    def test_within_district_duplicate_removed(self):
        rows = [
            {"polling_district": "LA", "elector_number": "47"},
            {"polling_district": "LA", "elector_number": "47"},
        ]
        out = c._dedupe_rows(rows)
        assert len(out) == 1

    def test_empty_elector_number_skipped(self):
        rows = [{"polling_district": "LA", "elector_number": ""}]
        assert c._dedupe_rows(rows) == []

    def test_first_occurrence_kept(self):
        rows = [
            {"polling_district": "LA", "elector_number": "1", "voted": "Y"},
            {"polling_district": "LA", "elector_number": "1", "voted": "N"},
        ]
        out = c._dedupe_rows(rows)
        assert out[0]["voted"] == "Y"


# ── _sort_key ─────────────────────────────────────────────────────────────────

class TestSortKey:
    def test_sorts_by_district_then_numeric_elector(self):
        rows = [
            {"polling_district": "LB", "elector_number": "2"},
            {"polling_district": "LA", "elector_number": "10"},
            {"polling_district": "LA", "elector_number": "2"},
        ]
        rows.sort(key=c._sort_key)
        assert [(r["polling_district"], r["elector_number"]) for r in rows] == [
            ("LA", "2"), ("LA", "10"), ("LB", "2"),
        ]


# ── build_filename ────────────────────────────────────────────────────────────

class TestBuildFilename:
    def test_all_parts_joined(self):
        # '/' is a forbidden filename char and is sanitised to a space.
        name = c.build_filename("Assoc", "Const", "Council", "GE 2026", "01/05/2026", "batch-1")
        assert name == "Assoc - Const - Council - GE 2026 - 01 05 2026 - Marked Register.csv"

    def test_missing_part_uses_fallback(self):
        name = c.build_filename("Assoc", "", "Council", "GE 2026", "01/05/2026", "batch-1")
        assert name == "batch-1 - Marked Register.csv"

    def test_forbidden_characters_sanitised(self):
        name = c.build_filename("A/B", "C:D", "E", "F", "G", "batch")
        assert "/" not in name.replace(" - ", "")
        assert ":" not in name


# ── District reporting + warnings (§6.5) ──────────────────────────────────────

class TestDistrictReporting:
    def test_count_districts(self):
        rows = [
            {"polling_district": "LA"}, {"polling_district": "LA"},
            {"polling_district": "LB"},
        ]
        assert c._count_districts(rows) == {"LA": 2, "LB": 1}

    def test_format_districts_orders_by_count_desc(self):
        text = c._format_districts({"LA": 1204, "LB": 987, "LA-2": 640})
        assert text == "Polling districts: 3 (LA: 1,204, LB: 987, LA-2: 640)"

    def test_format_districts_empty(self):
        assert c._format_districts({}) == "Polling districts: 0"


class TestWarningsTriggered:
    def test_high_dedupe_pct_triggers(self):
        assert c._warnings_triggered(dedupe_pct=30.0, synthetic_labels=set(), warn_pct=2.0) is True

    def test_synthetic_label_triggers(self):
        assert c._warnings_triggered(dedupe_pct=0.0, synthetic_labels={"LA-2"}, warn_pct=2.0) is True

    def test_clean_run_no_warning(self):
        assert c._warnings_triggered(dedupe_pct=0.5, synthetic_labels=set(), warn_pct=2.0) is False

    def test_pct_exactly_at_threshold_no_warning(self):
        assert c._warnings_triggered(dedupe_pct=2.0, synthetic_labels=set(), warn_pct=2.0) is False


# ── build_csv column mapping (page field must never reach the CSV) ────────────

class TestBuildCsv:
    def test_page_field_not_in_output(self):
        rows = [{
            "election_date": "01/05/2026", "constituency": "C", "polling_district": "LA",
            "elector_number": "47", "voted": "Y", "postal_vote": "N", "page": 3,
        }]
        out = c.build_csv(rows)
        header = out.splitlines()[0]
        assert header == "Election Date,Constituency,Polling District,Elector Number,Voted,Postal Vote"
        assert "page" not in out.lower().splitlines()[0]

    def test_header_and_row(self):
        rows = [{
            "election_date": "01/05/2026", "constituency": "C", "polling_district": "LA",
            "elector_number": "47", "voted": "Y", "postal_vote": "N",
        }]
        out = c.build_csv(rows)
        lines = out.strip().splitlines()
        assert lines[1] == "01/05/2026,C,LA,47,Y,N"
