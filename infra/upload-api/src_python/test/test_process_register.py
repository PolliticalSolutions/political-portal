"""Unit tests for the pure functions of the marked-register OCR worker.

These need neither Tesseract nor AWS: they exercise the elector-line parsing,
voting-mark heuristics, gap inference, chunk range splitting, and row building.
Together with test_combine_register they make the §3 correctness invariants
checkable in CI instead of only by hand.
"""

import json
import logging

import pytest

import combine_register.handler as c
import process_register.handler as h


SAFE_LABELLED_GEOMETRY_FIXTURES = [
    {
        "name": "two_column_near_gutter_house_number",
        "layout": "two-column",
        "declared": {"district": "NAA", "start": 700, "end": 702},
        "expected": ["701/1", "702"],
        "baseline_lines": [
            "701/1 -- SYNTHETIC ELECTOR ROW",
            "812 SAFE ADDRESS LABEL",
            "702 -- SYNTHETIC ELECTOR ROW",
        ],
        "candidate_lines": [
            "701/1 -- SYNTHETIC ELECTOR ROW",
            "SAFE ADDRESS LABEL",
            "702 -- SYNTHETIC ELECTOR ROW",
        ],
        "expected_baseline": {
            "captured_valid": ["701/1", "702"],
            "missing_declared": [700],
            "out_of_range": ["812"],
            "false_positives": 1,
            "false_negatives": 0,
        },
        "expected_candidate": {
            "captured_valid": ["701/1", "702"],
            "missing_declared": [700],
            "out_of_range": [],
            "false_positives": 0,
            "false_negatives": 0,
        },
    },
    {
        "name": "three_column_out_of_sequence_late_registration",
        "layout": "three-column",
        "declared": {"district": "NAB", "start": 557, "end": 560},
        # 557/1 deliberately follows 559. The candidate must not assume numeric
        # monotonicity; late-registration subnumbers can appear out of sequence.
        "expected": ["559", "557/1"],
        "baseline_lines": [
            "559 -- SYNTHETIC ELECTOR ROW",
            "612 SAFE ADDRESS LABEL",
            "557/1 -- SYNTHETIC ELECTOR ROW",
        ],
        "candidate_lines": [
            "559 -- SYNTHETIC ELECTOR ROW",
            "SAFE ADDRESS LABEL",
            "557/1 -- SYNTHETIC ELECTOR ROW",
        ],
        "expected_baseline": {
            "captured_valid": ["559", "557/1"],
            "missing_declared": [558, 560],
            "out_of_range": ["612"],
            "false_positives": 1,
            "false_negatives": 0,
        },
        "expected_candidate": {
            "captured_valid": ["559", "557/1"],
            "missing_declared": [558, 560],
            "out_of_range": [],
            "false_positives": 0,
            "false_negatives": 0,
        },
    },
]


def _parse_labelled_lines(lines):
    numbers = []
    previous = 0
    for line in lines:
        number, _voted = h._extract_elector_entry(line, previous)
        if number:
            numbers.append(number)
            previous = int(number.split("/")[0])
    return numbers


def _score_labelled_fixture(fixture, lines):
    actual = _parse_labelled_lines(lines)
    district = fixture["declared"]["district"]
    rows = [
        {"polling_district": district, "elector_number": number}
        for number in actual
    ]
    reports, issues = c.validate_rows_against_declared_ranges(
        rows, {district: fixture["declared"]}
    )
    assert issues == []
    report = reports[0]
    expected = fixture["expected"]
    return {
        "captured_valid": [number for number in expected if number in actual],
        "missing_declared": report["missing"],
        "out_of_range": report["out_of_range"],
        "false_positives": len([number for number in actual if number not in expected]),
        "false_negatives": len([number for number in expected if number not in actual]),
    }


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


# ── Defect B candidate: geometric elector-number gutter ─────────────────────

def _geometry_tsv(content_width, house_number="812"):
    border = h._COLUMN_OCR_BORDER_PX
    house_left = round(content_width * h._ELECTOR_NUMBER_GUTTER_RATIO) + 2
    return {
        "text": ["701/1", "SYNTHETIC", house_number, "SAFE", "702", "SYNTHETIC"],
        "left": [border + 10, border + 120, border + house_left,
                 border + house_left + 65, border + 10, border + 120],
        "top": [border + 10, border + 10, border + 60,
                border + 60, border + 110, border + 110],
        "width": [50, 80, 45, 50, 40, 80],
        "height": [20, 20, 20, 20, 20, 20],
        "page_num": [1, 1, 1, 1, 1, 1],
        "block_num": [1, 1, 1, 1, 1, 1],
        "par_num": [1, 1, 1, 1, 1, 1],
        "line_num": [1, 1, 2, 2, 3, 3],
    }


class TestGeometricElectorFilter:
    @pytest.mark.parametrize(
        ("layout", "content_width"),
        [("two-column", 600), ("three-column", 400)],
    )
    def test_house_number_just_outside_normalised_gutter_is_rejected(
        self, layout, content_width
    ):
        boxes = h._out_of_gutter_numeric_line_start_boxes(
            _geometry_tsv(content_width), content_width
        )
        assert layout in {"two-column", "three-column"}
        assert boxes == [{
            "left": round(content_width * h._ELECTOR_NUMBER_GUTTER_RATIO) + 2,
            "top": 60,
            "width": 45,
            "height": 20,
        }]

    def test_valid_subnumber_and_elector_rows_remain_inside_gutter(self):
        boxes = h._out_of_gutter_numeric_line_start_boxes(
            _geometry_tsv(600), 600
        )
        assert len(boxes) == 1
        assert boxes[0]["top"] == 60  # only the synthetic address row

    def test_flag_off_preserves_legacy_output_without_geometry_ocr(self, monkeypatch):
        monkeypatch.delenv(h._GEOMETRIC_ELECTOR_FILTER_FLAG, raising=False)
        monkeypatch.setattr(
            h.pytesseract,
            "image_to_data",
            lambda *args, **kwargs: pytest.fail("flag-off path called image_to_data"),
        )
        monkeypatch.setattr(
            h.pytesseract,
            "image_to_string",
            lambda *args, **kwargs: "\n".join(
                SAFE_LABELLED_GEOMETRY_FIXTURES[0]["baseline_lines"]
            ),
        )

        entries, last = h._process_column(
            h.Image.new("RGB", (600, 180), "white"), 0, 600
        )

        assert json.dumps(entries, separators=(",", ":")) == (
            '[{"elector_num":"701/1","voted":true},'
            '{"elector_num":"812","voted":false},'
            '{"elector_num":"702","voted":true}]'
        )
        assert last == 812

    def test_candidate_masks_house_number_and_records_count(
        self, monkeypatch, caplog
    ):
        monkeypatch.setenv(h._GEOMETRIC_ELECTOR_FILTER_FLAG, "true")
        content_width = 600
        data = _geometry_tsv(content_width)
        house_left = data["left"][2]
        house_top = data["top"][2]
        image = h.Image.new("RGB", (content_width, 180), "white")
        source_draw = h.ImageDraw.Draw(image)
        source_draw.rectangle(
            (
                house_left - h._COLUMN_OCR_BORDER_PX,
                house_top - h._COLUMN_OCR_BORDER_PX,
                house_left - h._COLUMN_OCR_BORDER_PX + data["width"][2],
                house_top - h._COLUMN_OCR_BORDER_PX + data["height"][2],
            ),
            fill="black",
        )
        monkeypatch.setattr(h.pytesseract, "image_to_data", lambda *a, **k: data)

        def fake_image_to_string(masked, **_kwargs):
            pixel = masked.getpixel((house_left + 2, house_top + 2))
            lines_key = (
                "candidate_lines" if pixel == (255, 255, 255) else "baseline_lines"
            )
            return "\n".join(SAFE_LABELLED_GEOMETRY_FIXTURES[0][lines_key])

        monkeypatch.setattr(h.pytesseract, "image_to_string", fake_image_to_string)

        with caplog.at_level(logging.INFO):
            entries, _last = h._process_column(image, 0, content_width)

        assert [entry["elector_num"] for entry in entries] == ["701/1", "702"]
        assert "rejected_line_starts=1" in caplog.text
        assert "bounding_boxes=" in caplog.text

    def test_in_gutter_out_of_range_number_is_not_range_deleted(self):
        data = _geometry_tsv(600, house_number="899")
        # Move 899 into the elector gutter: geometry must preserve it even though
        # §5 will diagnose it as outside this fixture's declared 700..702 range.
        data["left"][2] = h._COLUMN_OCR_BORDER_PX + 10
        assert h._out_of_gutter_numeric_line_start_boxes(data, 600) == []

        rows = [{"polling_district": "NAA", "elector_number": "899"}]
        before = [dict(rows[0])]
        reports, issues = c.validate_rows_against_declared_ranges(
            rows, {"NAA": {"district": "NAA", "start": 700, "end": 702}}
        )
        assert issues == []
        assert rows == before
        assert reports[0]["out_of_range"] == ["899"]

    @pytest.mark.parametrize(
        "fixture", SAFE_LABELLED_GEOMETRY_FIXTURES,
        ids=[fixture["name"] for fixture in SAFE_LABELLED_GEOMETRY_FIXTURES],
    )
    def test_labelled_baseline_candidate_scores(self, fixture):
        baseline = _score_labelled_fixture(fixture, fixture["baseline_lines"])
        candidate = _score_labelled_fixture(fixture, fixture["candidate_lines"])

        assert baseline == fixture["expected_baseline"]
        assert candidate == fixture["expected_candidate"]
        assert candidate["false_positives"] < baseline["false_positives"]
        assert candidate["false_negatives"] == baseline["false_negatives"] == 0


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
