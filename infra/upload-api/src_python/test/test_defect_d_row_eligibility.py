"""GDPR-safe regression tests for row eligibility and mark classification.

The fixtures are synthetic OCR strings only. They reproduce the structural
patterns demonstrated by the supplied Newcastle, Stafford and Manchester
pages without storing elector names, addresses, images or source filenames.
"""

from pathlib import Path

import process_register.handler as h


def test_county_cover_rules_exclude_a_e_and_f_but_not_b():
    text = """
    Staffordshire County Council Election 01 May 2025
    F, E, printed before a name indicates that an elector is NOT entitled
    to vote at the County Election.
    """
    assert h._extract_cover_row_rules_from_text(text) == {
        "election_family": "local",
        "excluded_in_person_codes": ["A", "E", "F"],
    }


def test_parliamentary_cover_rules_exclude_a_b_e_g_and_l():
    text = """
    UK Parliamentary General Election on Thursday 04 July 2024
    L, E, G, B, printed before a name indicates that an elector is NOT
    entitled to vote at the Parliamentary Election.
    """
    assert h._extract_cover_row_rules_from_text(text) == {
        "election_family": "parliamentary",
        "excluded_in_person_codes": ["A", "B", "E", "G", "L"],
    }


def test_unknown_cover_uses_only_universal_non_in_person_code():
    assert h._extract_cover_row_rules_from_text("Register of Electors") == {
        "election_family": "unknown",
        "excluded_in_person_codes": ["A"],
    }


def test_isolated_row_code_is_detected_without_treating_surname_as_code():
    assert h._extract_row_eligibility_code("798 A —— Sample, Elector") == "A"
    assert h._extract_row_eligibility_code("r 798 A —— Sample, Elector") == "A"
    assert h._extract_row_eligibility_code("595/1 B Sample, Elector") == "B"
    assert h._extract_row_eligibility_code("808 —— Sample, Elector") is None
    assert h._extract_row_eligibility_code("808 Brown, Elector") is None


def test_printed_a_exclusion_cannot_become_a_vote():
    line = "798 A —— Sample, Elector"
    number, raw_voted = h._extract_elector_entry(line)
    voted, code, reason = h._apply_row_eligibility_rules(
        line, raw_voted, {"A", "E", "F"}
    )
    assert number == "798"
    assert raw_voted is True
    assert (voted, code, reason) == (False, "A", "excluded_eligibility")


def test_genuine_short_or_full_row_marks_remain_votes_without_excluded_code():
    for line in (
        "808 —— Sample, Elector",
        "43 ————————— Sample, Elector ————————— 59",
    ):
        number, raw_voted = h._extract_elector_entry(line)
        voted, code, reason = h._apply_row_eligibility_rules(
            line, raw_voted, {"A", "B", "E", "G", "L"}
        )
        assert number is not None
        assert raw_voted is True
        assert (voted, code, reason) == (True, None, None)


def test_code_meaning_is_election_specific_and_proxy_marker_is_not_suppressed():
    county_line = "144 B —— Sample, Elector"
    parliament_line = "48 B —— Sample, Elector"
    proxy_line = "161 P —— Sample, Elector"

    _, county_raw = h._extract_elector_entry(county_line)
    _, parliament_raw = h._extract_elector_entry(parliament_line)
    _, proxy_raw = h._extract_elector_entry(proxy_line)

    assert h._apply_row_eligibility_rules(
        county_line, county_raw, {"A", "E", "F"}
    ) == (True, "B", None)
    assert h._apply_row_eligibility_rules(
        parliament_line, parliament_raw, {"A", "B", "E", "G", "L"}
    ) == (False, "B", "excluded_eligibility")
    assert h._apply_row_eligibility_rules(
        proxy_line, proxy_raw, {"A", "E", "F"}
    ) == (True, "P", None)


def test_removed_elector_is_recognised_even_if_a_dash_is_present():
    line = "482 —— Elector Removed"
    assert h._apply_row_eligibility_rules(
        line, True, {"A", "E", "F"}
    ) == (False, None, "removed")


def test_candidate_suppresses_numberless_strikethrough_between_real_rows():
    diagnostics = h._new_inference_diagnostics()
    rows = h._infer_missing_entries(
        [
            {"elector_num": "227", "main_num": 227, "voted": True},
            {
                "elector_num": None,
                "main_num": None,
                "voted": True,
                "is_strikethrough": True,
            },
            {"elector_num": "229", "main_num": 229, "voted": True},
        ],
        0,
        evidence_only_gap_inference=True,
        diagnostics=diagnostics,
        row_eligibility_filter=True,
    )
    assert rows == [
        {"elector_num": "227", "voted": True},
        {"elector_num": "229", "voted": True},
    ]
    assert diagnostics["unreadable_strikethrough_rows_suppressed"] == 1
    assert diagnostics["numeric_gap_rows_legacy_would_generate"] == 1


def test_subnumbers_and_out_of_order_readable_rows_remain_unchanged():
    rows = h._infer_missing_entries(
        [
            {"elector_num": "600", "main_num": 600, "voted": False},
            {"elector_num": "603", "main_num": 603, "voted": True},
            {"elector_num": "595/1", "main_num": 595, "voted": False},
        ],
        0,
        evidence_only_gap_inference=True,
        row_eligibility_filter=True,
    )
    assert [row["elector_num"] for row in rows] == ["600", "603", "595/1"]


def test_monotonic_filter_rejects_wrapped_address_numbers():
    diagnostics = h._new_inference_diagnostics()
    readable = [
        {"elector_num": "100", "main_num": 100},
        {"elector_num": "101", "main_num": 101},
        {"elector_num": "12", "main_num": 12},
        {"elector_num": "102", "main_num": 102},
        {"elector_num": "999", "main_num": 999},
        {"elector_num": "103", "main_num": 103},
    ]

    filtered = h._filter_monotonic_elector_entries(
        readable,
        diagnostics=diagnostics,
    )

    assert [entry["elector_num"] for entry in filtered] == [
        "100", "101", "102", "103",
    ]
    assert diagnostics["out_of_sequence_rows_excluded"] == 2


def test_monotonic_filter_preserves_subnumber_order():
    diagnostics = h._new_inference_diagnostics()
    readable = [
        {"elector_num": "47", "main_num": 47},
        {"elector_num": "47/1", "main_num": 47},
        {"elector_num": "48", "main_num": 48},
        {"elector_num": "49", "main_num": 49},
    ]

    filtered = h._filter_monotonic_elector_entries(
        readable,
        diagnostics=diagnostics,
    )

    assert filtered == readable
    assert diagnostics["out_of_sequence_rows_excluded"] == 0


def test_monotonic_filter_preserves_out_of_order_late_subnumber():
    diagnostics = h._new_inference_diagnostics()
    readable = [
        {"elector_num": "600", "main_num": 600},
        {"elector_num": "601", "main_num": 601},
        {"elector_num": "595/1", "main_num": 595},
        {"elector_num": "602", "main_num": 602},
    ]

    filtered = h._filter_monotonic_elector_entries(
        readable,
        diagnostics=diagnostics,
    )

    assert filtered == readable
    assert diagnostics["out_of_sequence_rows_excluded"] == 0


def test_row_candidate_defaults_off_but_prod_config_enables_explicitly():
    template = Path(__file__).parents[2] / "template.yaml"
    template_text = template.read_text()
    assert 'OcrRowEligibilityFilter:\n    Type: String\n    Default: "false"' in template_text
    assert "OCR_ROW_ELIGIBILITY_FILTER: !Ref OcrRowEligibilityFilter" in template_text

    config = Path(__file__).parents[2] / "samconfig.toml"
    assert 'OcrRowEligibilityFilter=\\"true\\"' in config.read_text()
