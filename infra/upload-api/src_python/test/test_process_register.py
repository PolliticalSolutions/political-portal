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

    def test_leading_strikethrough_without_anchor_is_skipped(self):
        # start_num == 0 and no readable number yet: a strikethrough with no
        # main_num has no basis for a number and must NOT fabricate elector "1".
        readable = [{"is_strikethrough": True, "main_num": None}]
        assert h._infer_missing_entries(readable, start_num=0) == []

    def test_leading_strikethrough_then_high_number_no_fabricated_one(self):
        readable = [
            {"is_strikethrough": True, "main_num": None},
            {"elector_num": "50", "main_num": 50, "voted": True},
        ]
        out = h._infer_missing_entries(readable, start_num=0)
        # The leading strikethrough contributes nothing; only the real 50 remains.
        assert [e["elector_num"] for e in out] == ["50"]

    def test_strikethrough_after_readable_is_still_inferred(self):
        # Once a readable number anchors the count, a following strikethrough is a
        # legitimate inference (the next number in sequence).
        readable = [
            {"elector_num": "50", "main_num": 50, "voted": True},
            {"is_strikethrough": True, "main_num": None},
        ]
        out = h._infer_missing_entries(readable, start_num=0)
        assert [e["elector_num"] for e in out] == ["50", "51"]
        assert out[1]["voted"] is True

    def test_strikethrough_with_context_start_num_is_inferred(self):
        # start_num > 0 provides the anchor, so a leading strikethrough infers from
        # context rather than being skipped.
        readable = [{"is_strikethrough": True, "main_num": None}]
        out = h._infer_missing_entries(readable, start_num=40)
        assert [e["elector_num"] for e in out] == ["41"]

    def test_low_first_readable_does_not_fill_preceding_gap(self):
        # A column whose first readable elector is 11 must produce just 11 — the
        # gap before the first readable number (1..10) has no basis and must not
        # be fabricated.
        readable = [{"elector_num": "11", "main_num": 11, "voted": True}]
        out = h._infer_missing_entries(readable, start_num=0)
        assert [e["elector_num"] for e in out] == ["11"]

    def test_gap_after_first_readable_still_fills(self):
        # 11, 15, 16 — the gap 12..14 between two readable numbers must still fill.
        readable = [
            {"elector_num": "11", "main_num": 11, "voted": True},
            {"elector_num": "15", "main_num": 15, "voted": True},
            {"elector_num": "16", "main_num": 16, "voted": True},
        ]
        out = h._infer_missing_entries(readable, start_num=0)
        assert [e["elector_num"] for e in out] == ["11", "12", "13", "14", "15", "16"]


# ── District patterns shared with the combiner (§6.2) ─────────────────────────

class TestDistrictPatterns:
    def test_patterns_are_module_level_list(self):
        assert isinstance(h._DISTRICT_PATTERNS, list)
        assert len(h._DISTRICT_PATTERNS) >= 4

    def test_polling_district_pattern_matches(self):
        import re
        m = re.search(h._DISTRICT_PATTERNS[0], "Polling District LA1", re.IGNORECASE)
        assert m and m.group(1) == "LA1"

    def test_structured_tokens_extract_code_despite_noise(self):
        assert h._extract_polling_district_from_tokens(
            ["x", "Polling", "District", "ECA", "r"]
        ) == "ECA"

    def test_structured_tokens_reject_generic_cover_label(self):
        assert h._extract_polling_district_from_tokens(
            ["Polling", "District", "Division"]
        ) is None

    def test_structured_tokens_require_polling_anchor(self):
        assert h._extract_polling_district_from_tokens(
            ["Elector", "District", "ECA"]
        ) is None


class TestPdfVoteTypeClassification:
    def test_incidental_postal_legend_does_not_classify_whole_register(self):
        text = (
            "Register of electors\n"
            "A postal voter cannot vote in person at the polling station.\n"
            "Postal votes marked register: see the prescribed marks legend."
        )
        assert h._classify_pdf_vote_type(text) == "In Person"

    def test_explicit_absent_voter_postal_list_is_postal(self):
        assert (
            h._classify_pdf_vote_type("Absent Voter Postal List Marked")
            == "Postal"
        )

    def test_explicit_list_of_postal_voters_is_postal(self):
        assert h._classify_pdf_vote_type("Marked List of Postal Voters") == "Postal"


class TestPageHeaderCrop:
    def test_header_ocr_keeps_top_quarter_for_layout_context(self, monkeypatch):
        crops = []

        class FakeImage:
            size = (1000, 2000)

            def crop(self, box):
                crops.append(box)
                return object()

        monkeypatch.setattr(
            h.pytesseract,
            "image_to_data",
            lambda _image, config=None, output_type=None: {
                "text": ["Polling", "District", "BSA"],
                "block_num": [1, 1, 1],
                "par_num": [1, 1, 1],
                "line_num": [1, 1, 1],
            },
        )

        district, ranges = h._extract_page_header(FakeImage())

        assert crops == [(0, 0, 1000, 500)]
        assert district == "BSA"
        assert ranges == []

    def test_missing_primary_code_uses_half_size_fallback(self, monkeypatch):
        class FakeHeader:
            size = (1000, 500)

            def resize(self, size, resample=None):
                assert size == (500, 250)
                return "half-size"

        class FakeImage:
            size = (1000, 2000)

            def crop(self, box):
                assert box == (0, 0, 1000, 500)
                return FakeHeader()

        responses = iter([
            {
                "text": [],
                "block_num": [],
                "par_num": [],
                "line_num": [],
            },
            {
                "text": ["Polling", "District", "BSG"],
                "block_num": [1, 1, 1],
                "par_num": [1, 1, 1],
                "line_num": [1, 1, 1],
            },
        ])
        monkeypatch.setattr(
            h.pytesseract,
            "image_to_data",
            lambda _image, config=None, output_type=None: next(responses),
        )

        assert h._extract_page_header(FakeImage()) == ("BSG", [])

    def test_half_size_extension_replaces_two_character_prefix(
        self, monkeypatch
    ):
        class FakeHeader:
            size = (1000, 500)

            def resize(self, size, resample=None):
                return "half-size"

        class FakeImage:
            size = (1000, 2000)

            def crop(self, box):
                return FakeHeader()

        responses = iter([
            {
                "text": ["Polling", "District", "EC"],
                "block_num": [1, 1, 1],
                "par_num": [1, 1, 1],
                "line_num": [1, 1, 1],
            },
            {
                "text": ["Polling", "District", "ECI"],
                "block_num": [1, 1, 1],
                "par_num": [1, 1, 1],
                "line_num": [1, 1, 1],
            },
        ])
        monkeypatch.setattr(
            h.pytesseract,
            "image_to_data",
            lambda _image, config=None, output_type=None: next(responses),
        )

        assert h._extract_page_header(FakeImage()) == ("ECI", [])


# ── Printed declared-range extraction (§5) ───────────────────────────────────

class TestDeclaredRangeParsing:
    def test_cover_declaration(self):
        assert h._extract_declared_ranges("Electors NAA-1 to NAA-926") == [
            {"district": "NAA", "start": 1, "end": 926}
        ]

    def test_page_header_declaration(self):
        assert h._extract_declared_ranges("Page 4 (NAA-1 / NAA-926)") == [
            {"district": "NAA", "start": 1, "end": 926}
        ]

    def test_register_not_starting_at_one_and_comma_number(self):
        assert h._extract_declared_ranges(
            "Electors TH7-557 to TH7-3,751"
        ) == [{"district": "TH7", "start": 557, "end": 3751}]

    def test_multiple_district_declarations_are_preserved(self):
        text = "Electors NAA-1 to NAA-926\nElectors NAB-50 to NAB-400"
        assert h._extract_declared_ranges(text) == [
            {"district": "NAA", "start": 1, "end": 926},
            {"district": "NAB", "start": 50, "end": 400},
        ]

    def test_mismatched_codes_are_rejected(self):
        assert h._extract_declared_ranges("Electors NAA-1 to NAB-926") == []

    def test_reversed_range_is_rejected(self):
        assert h._extract_declared_ranges("(NAA-926 / NAA-1)") == []

    def test_declared_code_is_ground_truth_fallback_for_typographic_dash(self):
        text = "Electors NAA – 1 to NAA – 926"
        declared = h._extract_declared_ranges(text)
        assert h._extract_polling_district_from_text(text, declared) == "NAA"

    def test_existing_district_pattern_still_wins_for_byte_equivalence(self):
        text = "Polling District LA1\nElectors NAA-1 to NAA-926"
        declared = h._extract_declared_ranges(text)
        assert h._extract_polling_district_from_text(text, declared) == "LA1"
