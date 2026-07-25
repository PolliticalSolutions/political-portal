"""Tests for privacy-safe OCR runtime version diagnostics."""

import hashlib
import json
from pathlib import Path

import ocr_runtime_versions as runtime


def _digest(value):
    return hashlib.sha256(value).hexdigest()


def test_collect_runtime_versions_matches_manifest_without_input_metadata(
        monkeypatch, tmp_path):
    bin_dir = tmp_path / "bin"
    tessdata_dir = tmp_path / "tessdata"
    bin_dir.mkdir()
    tessdata_dir.mkdir()
    tesseract = bin_dir / "tesseract"
    pdftoppm = bin_dir / "pdftoppm"
    eng = tessdata_dir / "eng.traineddata"
    osd = tessdata_dir / "osd.traineddata"
    tesseract.write_bytes(b"tesseract-binary")
    pdftoppm.write_bytes(b"poppler-binary")
    eng.write_bytes(b"eng-model")
    osd.write_bytes(b"osd-model")

    versions = {
        "tesseract": "tesseract 5.3.0",
        "pdftoppm": "pdftoppm version 22.12.0",
    }
    monkeypatch.setattr(
        runtime,
        "_first_version_line",
        lambda command: versions[Path(command[0]).name],
    )
    manifest = {
        "artifact": {"name": "test-artifact"},
        "components": {
            "tesseract": {
                "runtime_version": versions["tesseract"],
                "binary_sha256": _digest(b"tesseract-binary"),
            },
            "poppler": {
                "runtime_version": versions["pdftoppm"],
                "pdftoppm_sha256": _digest(b"poppler-binary"),
            },
            "trained_data": {
                "eng": {"sha256": _digest(b"eng-model")},
                "osd": {"sha256": _digest(b"osd-model")},
            },
        },
    }
    manifest_path = tmp_path / "ocr-runtime-manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    result = runtime.collect_ocr_runtime_versions(
        tesseract_cmd=tesseract,
        poppler_path=bin_dir,
        tessdata_prefix=tessdata_dir,
        manifest_path=manifest_path,
    )

    assert all(result["matches_manifest"].values())
    assert result["artifact"]["name"] == "test-artifact"
    rendered = json.dumps(result)
    assert str(tmp_path) not in rendered
    assert "elector" in result["privacy"].lower()
