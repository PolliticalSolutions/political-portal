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

    def test_unknown_ceiling_preserves_observed_high_number(self):
        num, _ = h._extract_elector_entry(
            "2122 —— Smith, John"
        )
        assert num == "2122"

    def test_trusted_printed_range_rejects_out_of_range_number(self):
        assert h._extract_elector_entry(
            "2122 —— Smith, John",
            maximum_elector_number=2000,
        ) == (None, None)
        num, _ = h._extract_elector_entry(
            "2122 —— Smith, John",
            maximum_elector_number=4007,
        )
        assert num == "2122"

    def test_printed_range_sets_exact_number_ceiling(self):
        assert h._maximum_declared_elector_number([]) is None
        assert h._maximum_declared_elector_number([
            {"district": "4OMD", "start": 1985, "end": 4007},
        ]) == 4007

    def test_cover_range_takes_precedence_over_noisy_page_range(self):
        assert h._maximum_declared_elector_number(
            [{"district": "3FAD", "start": 1, "end": 5577}],
            [{"district": "3FAD", "start": 1, "end": 1313}],
        ) == 1313

    def test_page_range_for_second_district_can_raise_cover_ceiling(self):
        assert h._maximum_declared_elector_number(
            [{"district": "2MSD", "start": 1473, "end": 2460}],
            [{"district": "2FAF", "start": 1, "end": 247}],
        ) == 2460

    def test_ocr_confusable_cover_code_still_takes_precedence(self):
        assert h._maximum_declared_elector_number(
            [{"district": "4WTS", "start": 1, "end": 9760}],
            [{"district": "4WT5", "start": 1, "end": 2547}],
        ) == 2547

    def test_out_of_range_main_number_repairs_to_adjacent_slash_base(self):
        number, _ = h._extract_elector_entry(
            "5577/1 —— Example, Person",
            context_prev_num=577,
            maximum_elector_number=1313,
            context_prev_elector="577",
        )
        assert number == "577/1"

    def test_out_of_range_main_number_repairs_one_digit_substitution(self):
        number, _ = h._extract_elector_entry(
            "9760 —— Example, Person",
            context_prev_num=1759,
            maximum_elector_number=2547,
            context_prev_elector="1759",
        )
        assert number == "1760"

    def test_merged_composite_repairs_to_next_ordinary_number(self):
        number, _ = h._extract_elector_entry(
            "1464/1461 —— Example, Person",
            context_prev_num=1460,
            maximum_elector_number=1737,
            context_prev_elector="1460",
        )
        assert number == "1461"

    def test_contaminated_long_suffix_repairs_from_same_base_sequence(self):
        number, _ = h._extract_elector_entry(
            "2840/1014 —— Example, Person",
            context_prev_num=2840,
            maximum_elector_number=2869,
            context_prev_elector="2840/100",
        )
        assert number == "2840/101"
        number, _ = h._extract_elector_entry(
            "2090/4600 —— Example, Person",
            context_prev_num=2090,
            maximum_elector_number=2327,
            context_prev_elector="2090/3",
        )
        assert number == "2090/4"

    def test_contaminated_one_digit_suffix_repairs_after_exact_base(self):
        number, voted = h._extract_elector_entry(
            "2090/4600 —— Example, Person",
            context_prev_num=2090,
            maximum_elector_number=2327,
            context_prev_elector="2090",
        )
        assert number == "2090/4"
        assert voted is True

    def test_non_round_long_suffix_after_exact_base_is_rejected(self):
        assert h._extract_elector_entry(
            "2090/4123 —— Example, Person",
            context_prev_num=2090,
            maximum_elector_number=2327,
            context_prev_elector="2090",
        ) == (None, None)

    def test_unsubstantiated_long_suffix_is_rejected(self):
        assert h._extract_elector_entry(
            "2090/4600 —— Example, Person",
            context_prev_num=2089,
            maximum_elector_number=2327,
            context_prev_elector="2089",
        ) == (None, None)


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

    def test_register_of_electors_header_extracts_district(self):
        assert h._extract_polling_district_from_text(
            "Register of Electors - DENW4 District DENW4"
        ) == "DENW4"

    def test_register_header_code_before_ward_name_extracts_district(self):
        assert h._extract_polling_district_from_text(
            "Register of Electors - FE1 Failsworth East"
        ) == "FE1"

    def test_hyphenated_register_code_is_canonicalised(self):
        assert h._extract_polling_district_from_text(
            "Register of Electors - R-NB"
        ) == "RNB"

    def test_election_prefix_is_not_appended_to_register_code(self):
        assert h._extract_polling_district_from_text(
            "Register of Electors - 4OMAUK Parliamentary General Election"
        ) == "4OMA"

    def test_compact_ukpge_label_is_not_appended_to_register_code(self):
        assert h._extract_polling_district_from_text(
            "Register of Electors - 4CPEUK PGE 04-Jul-2024"
        ) == "4CPE"
        assert h._extract_polling_district_from_text(
            "Register of Electors - 4CPEUKPGE 04-Jul-2024"
        ) == "4CPE"

    def test_council_heading_does_not_append_compact_ukpge_label(self):
        assert h._extract_polling_district_from_text(
            "Manchester City Council - 4CPEUK PGE 04-Jul-2024"
        ) == "4CPE"

    def test_next_line_uk_label_is_not_a_hyphenated_district_suffix(self):
        assert h._extract_polling_district_from_text(
            "Register of Electors - 4CPE\n"
            "- UK Parliamentary General Election 04-Jul-2024"
        ) == "4CPE"

    def test_unique_declared_range_overrides_noisy_heading_code(self):
        assert h._extract_polling_district_from_text(
            "Register of Electors - Z2ABE "
            "(2ABE-1575 / 2ABE-3142)"
        ) == "2ABE"
        assert h._extract_polling_district_from_text(
            "Register of Electors - 4D "
            "(4DWE-1447 / 4DWE-2910)"
        ) == "4DWE"

    def test_generic_station_after_council_is_not_a_district(self):
        assert h._extract_polling_district_from_text(
            "Manchester City Council - Station Number 170"
        ) is None

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


class TestDocumentOrientation:
    class FakeImage:
        def __init__(self, orientation=0):
            self.orientation = orientation
            self.closed = False

        def transpose(self, method):
            assert method == h.Image.Transpose.ROTATE_180
            return TestDocumentOrientation.FakeImage(180)

        def close(self):
            self.closed = True

    def test_upside_down_cover_requires_district_and_date_evidence(
        self, monkeypatch
    ):
        def fake_extract(image):
            if image.orientation == 180:
                return "02/05/2024", "2WRG", "In Person", []
            return None, "Unknown", "In Person", []

        monkeypatch.setattr(h, "_extract_metadata", fake_extract)

        metadata, rotation = h._extract_metadata_with_orientation(
            self.FakeImage()
        )

        assert metadata == ("02/05/2024", "2WRG", "In Person", [])
        assert rotation == 180

    def test_rotated_district_without_independent_evidence_is_rejected(
        self, monkeypatch
    ):
        def fake_extract(image):
            if image.orientation == 180:
                return None, "2WRG", "In Person", []
            return None, "Unknown", "In Person", []

        monkeypatch.setattr(h, "_extract_metadata", fake_extract)

        metadata, rotation = h._extract_metadata_with_orientation(
            self.FakeImage()
        )

        assert metadata == (None, "Unknown", "In Person", [])
        assert rotation == 0

    def test_readable_normal_cover_is_never_rotated(self, monkeypatch):
        calls = []

        def fake_extract(image):
            calls.append(image.orientation)
            return "02/05/2024", "2WRG", "In Person", []

        monkeypatch.setattr(h, "_extract_metadata", fake_extract)

        metadata, rotation = h._extract_metadata_with_orientation(
            self.FakeImage()
        )

        assert metadata == ("02/05/2024", "2WRG", "In Person", [])
        assert rotation == 0
        assert calls == [0]

    def test_page_rotation_closes_the_unrotated_render(self):
        original = self.FakeImage()

        rotated = h._apply_document_page_rotation(original, 180)

        assert original.closed is True
        assert rotated.orientation == 180

    def test_rotated_pages_require_their_own_declared_range(self):
        declared = [{"district": "2WRG", "start": 1, "end": 73}]

        assert h._page_has_trusted_row_context(0, []) is True
        assert h._page_has_trusted_row_context(180, []) is False
        assert h._page_has_trusted_row_context(180, declared) is True

    def test_rotated_row_recovers_exact_anchored_struck_number(
        self, monkeypatch
    ):
        monkeypatch.setattr(
            h,
            "_ocr_column_line_records",
            lambda _image: [{
                "text": "25 --------",
                "eno_anchored": True,
                "eno_candidate": "25",
            }],
        )
        image = h.Image.new("RGB", (100, 100), "white")

        entries, last = h._process_column(
            image,
            0,
            100,
            row_eligibility_filter=True,
            maximum_elector_number=73,
            recover_anchored_strikethrough_numbers=True,
        )

        assert entries == [{"elector_num": "25", "voted": True}]
        assert last == 25

    def test_normal_row_path_does_not_enable_rotated_strike_recovery(
        self, monkeypatch
    ):
        monkeypatch.setattr(
            h,
            "_ocr_column_line_records",
            lambda _image: [{
                "text": "25 --------",
                "eno_anchored": True,
                "eno_candidate": "25",
            }],
        )
        image = h.Image.new("RGB", (100, 100), "white")

        entries, last = h._process_column(
            image,
            0,
            100,
            row_eligibility_filter=True,
            maximum_elector_number=73,
        )

        assert entries == []
        assert last == 0

    def test_range_bound_candidate_uses_sequence_and_pending_strike(self):
        assert h._recover_range_bound_eno_candidate(
            "341", 30, "30", 0, 73
        ) == "31"
        assert h._recover_range_bound_eno_candidate(
            "48", 16, "16", 1, 51
        ) == "18"
        assert h._recover_range_bound_eno_candidate(
            "7", 41, "41", 0, 51
        ) == "42"

    def test_range_bound_candidate_repairs_only_next_slash_supplement(self):
        assert h._recover_range_bound_eno_candidate(
            "20/4", 20, "20", 0, 73
        ) == "20/1"
        assert h._recover_range_bound_eno_candidate(
            "26/2", 20, "20/1", 0, 73
        ) == "20/2"
        assert h._recover_range_bound_eno_candidate(
            "70/9", 70, "70", 0, 73
        ) is None

    def test_bracketed_numberless_strike_requires_both_anchors(self):
        entries = [
            {"elector_num": "16", "main_num": 16, "voted": False},
            {
                "elector_num": None,
                "main_num": None,
                "voted": True,
                "is_strikethrough": True,
            },
            {"elector_num": "18", "main_num": 18, "voted": True},
        ]
        diagnostics = h._new_inference_diagnostics()

        recovered = h._recover_bracketed_strikethrough_entries(
            entries,
            diagnostics,
        )

        assert recovered[1]["elector_num"] == "17"
        assert recovered[1]["voted"] is True
        assert diagnostics["explicit_strikethrough_rows_inferred"] == 1

        unbracketed = h._recover_bracketed_strikethrough_entries(entries[:2])
        assert unbracketed[1]["elector_num"] is None

    def test_duplicate_successor_is_repaired_only_around_its_supplement(self):
        entries = [
            {"elector_num": "25", "main_num": 25, "voted": True},
            {"elector_num": "27", "main_num": 27, "voted": False},
            {"elector_num": "26/1", "main_num": 26, "voted": False},
            {"elector_num": "27", "main_num": 27, "voted": False},
        ]

        repaired = h._repair_duplicate_successor_around_supplement(entries)

        assert [entry["elector_num"] for entry in repaired] == [
            "25", "26", "26/1", "27",
        ]

    def test_evidence_only_gap_policy_does_not_insert_unobserved_row(self):
        entries = [
            {
                "elector_num": str(number),
                "main_num": number,
                "voted": voted,
                "eno_anchored": True,
            }
            for number, voted in ((35, True), (37, True))
        ]

        recovered = h._infer_missing_entries(
            entries,
            0,
            evidence_only_gap_inference=True,
            row_eligibility_filter=True,
        )

        assert recovered == [
            {"elector_num": "35", "voted": True},
            {"elector_num": "37", "voted": True},
        ]

    def test_monotonic_filter_preserves_committed_sequence_repairs(self):
        values = [
            "1", "1/1", "2", "3", "4", "5", "6", "7", "8", "9",
            "10", "11", "12", "13", "44", "45", "46", "48", "49",
            "20", "24", "25", "23", "24", "26", "26", "26/1", "27",
            "28", "29", "30", "31", "32", "33", "34", "35", "36",
            "37", "39", "40", "41", "47",
        ]
        entries = [
            {
                "elector_num": value,
                "main_num": int(value.split("/", 1)[0]),
                "voted": False,
                "eno_anchored": True,
                "eno_sequence_repaired": value in {"35", "37"},
            }
            for value in values
        ]
        committed = [
            entry for entry in entries
            if entry["eno_sequence_repaired"] is True
        ]

        filtered = h._filter_monotonic_elector_entries(entries)

        assert [entry["elector_num"] for entry in committed] == ["35", "37"]
        assert all(any(entry is candidate for candidate in filtered)
                   for entry in committed)


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

    def test_repeated_range_codes_allow_tight_o_zero_ocr_substitution(self):
        assert h._extract_declared_ranges(
            "UK Parliamentary General Election "
            "04-Jul-2024(4OMD-1 / 40MD-1984)"
        ) == [{"district": "4OMD", "start": 1, "end": 1984}]

    def test_declared_start_one_allows_single_ocr_letter(self):
        assert h._extract_declared_ranges(
            "UK Parliamentary General Election "
            "04-Jul-2024(2ARG-I / 2ARG-917/7)"
        ) == [{"district": "2ARG", "start": 1, "end": 917}]
        assert h._extract_declared_ranges(
            "UK Parliamentary General Election "
            "04-Jul-2024(3LEC-l / 3LEC-2017/2)"
        ) == [{"district": "3LEC", "start": 1, "end": 2017}]

    def test_declared_number_repairs_internal_ocr_spacing(self):
        assert h._extract_declared_ranges(
            "UK Parliamentary General Election "
            "04-Jul-2024(2ARG-1 / 2ARG-91 7/7)"
        ) == [{"district": "2ARG", "start": 1, "end": 917}]
        assert h._extract_declared_ranges(
            "UK Parliamentary General Election "
            "04-Jul-2024(3LEC-1 / 3LEC-201 7/2)"
        ) == [{"district": "3LEC", "start": 1, "end": 2017}]

    def test_reversed_range_is_rejected(self):
        assert h._extract_declared_ranges("(NAA-926 / NAA-1)") == []

    def test_hyphenated_district_range_is_canonicalised(self):
        assert h._extract_declared_ranges(
            "UKPGE (R-NB-1 / R-NB-1678)"
        ) == [{"district": "RNB", "start": 1, "end": 1678}]

    def test_declared_start_subnumber_uses_main_number(self):
        assert h._extract_declared_ranges(
            "UK Parliamentary Election (3WRB-1572/1 / 3WRB-3108)"
        ) == [{"district": "3WRB", "start": 1572, "end": 3108}]

    def test_declared_code_is_ground_truth_fallback_for_typographic_dash(self):
        text = "Electors NAA – 1 to NAA – 926"
        declared = h._extract_declared_ranges(text)
        assert h._extract_polling_district_from_text(text, declared) == "NAA"

    def test_existing_district_pattern_still_wins_for_byte_equivalence(self):
        text = "Polling District LA1\nElectors NAA-1 to NAA-926"
        declared = h._extract_declared_ranges(text)
        assert h._extract_polling_district_from_text(text, declared) == "LA1"
