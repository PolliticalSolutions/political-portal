import importlib.util
from pathlib import Path
import sys
import types


MODULE_PATH = (
    Path(__file__).resolve().parents[1]
    / "local_register_structure_audit.py"
)


def _load_module():
    module_names = ("process_register", "process_register.handler")
    originals = {name: sys.modules.get(name) for name in module_names}
    process_handler = types.ModuleType("process_register.handler")
    process_handler.OCR_AVAILABLE = True
    process_package = types.ModuleType("process_register")
    process_package.handler = process_handler
    sys.modules["process_register"] = process_package
    sys.modules["process_register.handler"] = process_handler

    try:
        spec = importlib.util.spec_from_file_location(
            "local_register_structure_audit",
            MODULE_PATH,
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for name, original in originals.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original


audit = _load_module()


def test_safe_district_accepts_only_short_codes():
    assert audit._safe_district(" bsa ") == "BSA"
    assert audit._safe_district("NAA1") == "NAA1"
    assert audit._safe_district("Stafford Central") is None
    assert audit._safe_district("../../secret") is None


def test_safe_ranges_deduplicates_and_rejects_invalid_values():
    ranges = audit._safe_ranges([
        {"district": "bsa", "start": "1", "end": "999"},
        {"district": "BSA", "start": 1, "end": 999},
        {"district": "a name", "start": 1, "end": 2},
        {"district": "BSA", "start": 9, "end": 3},
    ])
    assert ranges == [{
        "district": "BSA",
        "declared_start": 1,
        "declared_end": 999,
    }]


def test_district_runs_preserves_boundaries_without_ocr_text():
    headers = [
        {"page": 3, "polling_district": "BSA"},
        {"page": 4, "polling_district": "BSA"},
        {"page": 5, "polling_district": None},
        {"page": 6, "polling_district": "BSC"},
    ]
    assert audit._district_runs(headers) == [
        {
            "polling_district": "BSA",
            "start_page": 3,
            "end_page": 4,
            "page_count": 2,
        },
        {
            "polling_district": None,
            "start_page": 5,
            "end_page": 5,
            "page_count": 1,
        },
        {
            "polling_district": "BSC",
            "start_page": 6,
            "end_page": 6,
            "page_count": 1,
        },
    ]


def test_content_page_sampling_is_even_and_includes_both_ends():
    assert audit._content_page_numbers(12, skip_pages=2, sample_pages_per_document=4) == [
        3,
        6,
        9,
        12,
    ]
    assert audit._content_page_numbers(5, skip_pages=2, sample_pages_per_document=1) == [
        4,
    ]
    assert audit._content_page_numbers(5, skip_pages=2, sample_pages_per_document=0) == [
        3,
        4,
        5,
    ]
