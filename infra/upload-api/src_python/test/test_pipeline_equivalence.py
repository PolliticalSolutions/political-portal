"""Structural half of the Test 1 byte-identical gate (§9), without Tesseract.

The OCR step itself cannot be exercised here (no Tesseract layer / fixture PDF),
but the *rest* of the pipeline can: given the per-page extracted rows, the
combiner must produce byte-identical CSV whether those rows arrive as a single
chunk or split across several chunks. This test drives the real combiner
functions (resolve → dedupe → sort → build_csv) over synthetic chunk payloads to
prove chunk boundaries do not alter the output.

The full golden-file test that also covers OCR must be run against the deployed
Tesseract layer with a committed fixture register (spec §9, Test 1 / Test 1b);
it cannot run in this dependency-free CI job.
"""

import combine_register.handler as c


def _make_page_rows(page, electors, seed="LA"):
    """One row per elector on a page, as the worker would emit them."""
    rows = []
    for en, voted in electors:
        rows.append({
            "page": page,
            "elector_number": en,
            "polling_district": seed,
            "voted": "Y" if voted else "N",
            "election_date": "01/05/2026",
            "constituency": "Testville",
            "postal_vote": "N",
        })
    return rows


def _chunk_payload(chunk_index, pages, seed="LA"):
    """Build a chunk output payload spanning the given {page: electors} pages."""
    rows = []
    page_districts = {}
    page_declared_ranges = {}
    for page, electors in sorted(pages.items()):
        rows.extend(_make_page_rows(page, electors, seed))
        page_districts[str(page)] = seed
        page_declared_ranges[str(page)] = [
            {"district": seed, "start": 1, "end": 30}
        ]
    return {
        "chunkIndex": chunk_index,
        "totalChunks": 0,  # not read by the pipeline under test
        "pageDistricts": page_districts,
        "pageDeclaredRanges": page_declared_ranges,
        "rows": rows,
        "meta": {
            "polling_district": seed,
            "election_date": "01/05/2026",
            "vote_type": "In Person",
            "declared_ranges": [{"district": seed, "start": 1, "end": 30}],
        },
    }


def _run_pipeline(payloads):
    """Mirror the combiner handler's per-job sequence: merge chunk rows + page
    maps, resolve districts, dedupe, sort, build CSV."""
    payloads = sorted(payloads, key=lambda p: p.get("chunkIndex", 0))
    job_rows = []
    page_districts = {}
    page_declared_ranges = {}
    cover_declared_ranges = []
    for p in payloads:
        job_rows.extend(p["rows"])
        for k, v in p["pageDistricts"].items():
            page_districts[str(k)] = v
        for k, v in p["pageDeclaredRanges"].items():
            page_declared_ranges[str(k)] = v
        cover_declared_ranges.extend((p.get("meta") or {}).get("declared_ranges") or [])
    seeds = [(p.get("meta") or {}).get("polling_district") for p in payloads]
    seeds = [s for s in seeds if s]
    seed = seeds[0] if seeds else ""
    if any("page" in r for r in job_rows):
        c.resolve_job_districts(job_rows, page_districts, seed)
    trusted, issues = c.resolve_declared_ranges(cover_declared_ranges, page_declared_ranges)
    reports, validation_issues = c.validate_rows_against_declared_ranges(job_rows, trusted)
    assert issues == []
    assert validation_issues == []
    assert len(reports) == 1
    job_rows = c._dedupe_rows(job_rows)
    job_rows.sort(key=c._sort_key)
    return c.build_csv(job_rows)


# A synthetic single-district register: pages 3..12, with a couple of cross-page
# OCR-artefact duplicates (electors 30 and 61 repeated on the next page) that the
# combiner dedupe must collapse identically regardless of chunk boundaries.
SINGLE_DISTRICT_PAGES = {
    3: [("1", True), ("2", False), ("3", True)],
    4: [("4", True), ("5", False), ("6", True)],
    5: [("7", False), ("8", True), ("9", True)],
    6: [("10", True), ("11", False), ("12", True)],
    7: [("13", True), ("14", True), ("15", False)],
    8: [("16", False), ("17", True), ("18", True)],
    9: [("19", True), ("20", False), ("21", True)],
    10: [("22", True), ("23", True), ("24", False)],
    11: [("25", False), ("26", True), ("27", True)],
    12: [("28", True), ("29", False), ("30", True)],
}


def _pages_subset(pages):
    return {p: SINGLE_DISTRICT_PAGES[p] for p in pages if p in SINGLE_DISTRICT_PAGES}


class TestChunkBoundaryEquivalence:
    def test_single_chunk_equals_three_chunks(self):
        one = [_chunk_payload(0, SINGLE_DISTRICT_PAGES)]

        three = [
            _chunk_payload(0, _pages_subset([3, 4, 5])),
            _chunk_payload(1, _pages_subset([6, 7, 8, 9, 10])),
            _chunk_payload(2, _pages_subset([11, 12])),
        ]

        assert _run_pipeline(one) == _run_pipeline(three)

    def test_single_chunk_equals_ten_single_page_chunks(self):
        one = [_chunk_payload(0, SINGLE_DISTRICT_PAGES)]
        ten = [
            _chunk_payload(i, _pages_subset([page]))
            for i, page in enumerate(sorted(SINGLE_DISTRICT_PAGES))
        ]
        assert _run_pipeline(one) == _run_pipeline(ten)

    def test_chunk_order_does_not_matter(self):
        """Concurrency determinism (Test 2): chunks read in any order yield the
        same CSV because the combiner sorts by _sort_key at the end."""
        forward = [
            _chunk_payload(0, _pages_subset([3, 4, 5])),
            _chunk_payload(1, _pages_subset([6, 7, 8, 9, 10])),
            _chunk_payload(2, _pages_subset([11, 12])),
        ]
        shuffled = [forward[2], forward[0], forward[1]]
        assert _run_pipeline(forward) == _run_pipeline(shuffled)

    def test_cross_page_duplicate_collapses_identically(self):
        """A single-district cross-page repeat is collapsed by the combiner
        dedupe, so its presence does not depend on which chunk it lands in."""
        pages_with_dupe = dict(SINGLE_DISTRICT_PAGES)
        # Elector 3 (last of page 3) repeated as first of page 4 — an artefact.
        pages_with_dupe[4] = [("3", True)] + SINGLE_DISTRICT_PAGES[4]

        one = [_chunk_payload(0, pages_with_dupe)]
        split = [
            _chunk_payload(0, {3: pages_with_dupe[3]}),
            _chunk_payload(1, {4: pages_with_dupe[4]}),
            _chunk_payload(2, {p: pages_with_dupe[p] for p in range(5, 13)}),
        ]
        csv_one = _run_pipeline(one)
        csv_split = _run_pipeline(split)
        assert csv_one == csv_split
        # Elector 3 appears exactly once in the final CSV.
        assert csv_one.count(",3,") == 1


class TestMixedPdfAndCsvEquivalence:
    def test_source_order_does_not_change_merged_cchq_output(self):
        pdf_row = {
            "election_date": "01/05/2026",
            "constituency": "Testville",
            "polling_district": "PD1",
            "elector_number": "47/1",
            "voted": "Y",
            "postal_vote": "N",
            "_source_type": "pdf",
        }
        absent_voter_row = {
            "election_date": "01/05/2026",
            "constituency": "Testville",
            "polling_district": "PD1",
            "elector_number": "47/1",
            "voted": "N",
            "postal_vote": "Y",
            "_source_type": "csv",
        }

        def render(rows):
            merged = c._dedupe_rows(rows)
            merged.sort(key=c._sort_key)
            return c.build_csv(merged)

        pdf_first = render([pdf_row, absent_voter_row])
        csv_first = render([absent_voter_row, pdf_row])

        assert pdf_first == csv_first
        assert pdf_first == (
            "Election Date,Constituency,Polling District,Elector Number,"
            "Voted,Postal Vote\r\n"
            "01/05/2026,Testville,PD1,47/1,Y,Y\r\n"
        )
