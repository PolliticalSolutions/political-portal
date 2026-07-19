"""Unit tests for the pure functions of the marked-register OCR worker.

These need neither Tesseract nor AWS: they exercise the elector-line parsing,
voting-mark heuristics, gap inference, chunk range splitting, and row building.
Together with test_combine_register they make the §3 correctness invariants
checkable in CI instead of only by hand.
"""

import process_register.handler as h


# ── Chunk range splitting (§5.1) ──────────────────────────────────────────────

class TestBuildChunkRanges:
    def test_single_chunk_when_smaller_than_chunk_size(self):
        assert h._build_chunk_ranges(12, 20) == [(1, 12)]

    def test_multiple_chunks(self):
        assert h._build_chunk_ranges(12, 5) == [(1, 5), (6, 10), (11, 12)]

    def test_160_pages_at_20(self):
        ranges = h._build_chunk_ranges(160, 20)
        assert len(ranges) == 8
        assert ranges[0] == (1, 20)
        assert ranges[-1] == (141, 160)

    def test_exact_multiple(self):
        assert h._build_chunk_ranges(40, 20) == [(1, 20), (21, 40)]

    def test_ranges_cover_every_page_once_no_gaps_or_overlaps(self):
        for total in (1, 7, 20, 21, 99, 160, 201):
            for size in (1, 5, 20, 50):
                ranges = h._build_chunk_ranges(total, size)
                covered = []
                for start, end in ranges:
                    covered.extend(range(start, end + 1))
                assert covered == list(range(1, total + 1)), (total, size)

    def test_single_page_document(self):
        assert h._build_chunk_ranges(1, 20) == [(1, 1)]


# ── Row building (§5.2) ───────────────────────────────────────────────────────

class TestBuildRows:
    def test_attach_page_true_includes_page(self):
        rows = h._build_rows(
            [{"elector_num": "47", "voted": True, "page": 3}],
            "Testville", "01/05/2026", "LA", "In Person", attach_page=True,
        )
        assert rows == [{
            "election_date": "01/05/2026",
            "constituency": "Testville",
            "polling_district": "LA",
            "elector_number": "47",
            "voted": "Y",
            "postal_vote": "N",
            "page": 3,
        }]

    def test_attach_page_false_omits_page_legacy_shape(self):
        rows = h._build_rows(
            [{"elector_num": "47", "voted": True, "page": 3}],
            "Testville", "01/05/2026", "LA", "In Person", attach_page=False,
        )
        assert "page" not in rows[0]

    def test_voted_and_postal_mapping(self):
        rows = h._build_rows(
            [{"elector_num": "1", "voted": False}],
            "C", "01/05/2026", "LA", "Postal", attach_page=False,
        )
        assert rows[0]["voted"] == "N"
        assert rows[0]["postal_vote"] == "Y"

    def test_blank_constituency_defaults(self):
        rows = h._build_rows(
            [{"elector_num": "1", "voted": True}],
            "", "01/05/2026", "LA", "In Person", attach_page=False,
        )
        assert rows[0]["constituency"] == "Unknown Constituency"


# ── Elector line extraction (§8 — must not regress) ───────────────────────────

class TestExtractElectorEntry:
    def test_basic_voted_entry(self):
        num, voted = h._extract_elector_entry("47 —— Smith, John")
        assert num == "47"
        assert voted is True

    def test_sub_numbered_elector_preserved(self):
        num, _ = h._extract_elector_entry("47/1 —— Smith, John")
        assert num == "47/1"

    def test_skip_keyword_line_rejected(self):
        num, _ = h._extract_elector_entry("Polling District LA")
        assert num is None

    def test_too_short_line_rejected(self):
        assert h._extract_elector_entry("ab") == (None, None)

    def test_zero_prefixed_number_rejected(self):
        num, _ = h._extract_elector_entry("047 —— Smith, John")
        assert num is None


class TestHasVotingMark:
    def test_double_dash_is_mark(self):
        assert h._has_voting_mark("47 —— Smith") is True

    def test_plain_name_no_mark(self):
        assert h._has_voting_mark("Smith John") is False


class TestStrikethrough:
    def test_clean_name_not_strikethrough(self):
        assert h._is_likely_strikethrough("Smith, John Andrew") is False

    def test_short_line_not_strikethrough(self):
        assert h._is_likely_strikethrough("abc") is False


class TestInferMissingEntries:
    def test_fills_small_gap(self):
        readable = [
            {"elector_num": "1", "main_num": 1, "voted": False},
            {"elector_num": "4", "main_num": 4, "voted": True},
        ]
        out = h._infer_missing_entries(readable, start_num=0)
        nums = [e["elector_num"] for e in out]
        # 2 and 3 are inferred between 1 and 4.
        assert nums == ["1", "2", "3", "4"]

    def test_large_gap_not_filled(self):
        readable = [
            {"elector_num": "1", "main_num": 1, "voted": False},
            {"elector_num": "100", "main_num": 100, "voted": True},
        ]
        out = h._infer_missing_entries(readable, start_num=0)
        nums = [e["elector_num"] for e in out]
        assert nums == ["1", "100"]

    def test_empty_input(self):
        assert h._infer_missing_entries([], 0) == []


# ── District patterns shared with the combiner (§6.2) ─────────────────────────

class TestDistrictPatterns:
    def test_patterns_are_module_level_list(self):
        assert isinstance(h._DISTRICT_PATTERNS, list)
        assert len(h._DISTRICT_PATTERNS) >= 4

    def test_polling_district_pattern_matches(self):
        import re
        m = re.search(h._DISTRICT_PATTERNS[0], "Polling District LA1", re.IGNORECASE)
        assert m and m.group(1) == "LA1"
