"""Privacy-safe OCR runtime version diagnostics for local validation."""

import hashlib
import json
import os
import subprocess
from pathlib import Path


def _sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _first_version_line(command):
    completed = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    for line in (completed.stdout + "\n" + completed.stderr).splitlines():
        if line.strip():
            return line.strip()
    raise RuntimeError(f"No version output from {Path(command[0]).name}")


def collect_ocr_runtime_versions(
        tesseract_cmd=None, poppler_path=None, tessdata_prefix=None,
        manifest_path=None):
    """Return aggregate-only binary identities without OCR or input metadata."""
    tesseract = Path(
        tesseract_cmd
        or os.environ.get("LOCAL_TESSERACT_CMD")
        or "/opt/bin/tesseract"
    )
    poppler = Path(
        poppler_path
        or os.environ.get("LOCAL_POPPLER_PATH")
        or "/opt/bin"
    )
    tessdata = Path(
        tessdata_prefix
        or os.environ.get("TESSDATA_PREFIX")
        or "/opt/tessdata"
    )
    manifest = Path(
        manifest_path
        or os.environ.get("OCR_RUNTIME_MANIFEST")
        or "/opt/ocr-runtime-manifest.json"
    )

    result = {
        "privacy": (
            "Runtime-only diagnostics. No elector data, OCR text, source "
            "filenames, input paths, names, or addresses are collected."
        ),
        "tesseract": {
            "version": _first_version_line([str(tesseract), "--version"]),
            "binary_sha256": _sha256(tesseract),
        },
        "poppler": {
            "version": _first_version_line([str(poppler / "pdftoppm"), "-v"]),
            "pdftoppm_sha256": _sha256(poppler / "pdftoppm"),
        },
        "trained_data": {
            name: {"sha256": _sha256(tessdata / f"{name}.traineddata")}
            for name in ("eng", "osd")
        },
    }

    if manifest.is_file():
        manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
        expected = manifest_data.get("components", {})
        result["artifact"] = manifest_data.get("artifact", {})
        result["manifest_sha256"] = _sha256(manifest)
        result["matches_manifest"] = {
            "tesseract_version": (
                result["tesseract"]["version"]
                == expected.get("tesseract", {}).get("runtime_version")
            ),
            "tesseract_binary": (
                result["tesseract"]["binary_sha256"]
                == expected.get("tesseract", {}).get("binary_sha256")
            ),
            "poppler_version": (
                result["poppler"]["version"]
                == expected.get("poppler", {}).get("runtime_version")
            ),
            "pdftoppm_binary": (
                result["poppler"]["pdftoppm_sha256"]
                == expected.get("poppler", {}).get("pdftoppm_sha256")
            ),
            "eng_trained_data": (
                result["trained_data"]["eng"]["sha256"]
                == expected.get("trained_data", {}).get("eng", {}).get("sha256")
            ),
            "osd_trained_data": (
                result["trained_data"]["osd"]["sha256"]
                == expected.get("trained_data", {}).get("osd", {}).get("sha256")
            ),
        }
    return result
