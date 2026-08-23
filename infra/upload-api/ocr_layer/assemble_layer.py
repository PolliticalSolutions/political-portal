"""Assemble and deterministically package the native OCR Lambda layer.

This runs only inside the pinned AL2023 build image. It copies the three
required executables, recursively resolves their non-glibc shared libraries,
adds the pinned trained data, and writes a privacy-safe runtime manifest.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path


_SYSTEM_RUNTIME_LIBRARIES = {
    "ld-linux-x86-64.so.2",
    "libanl.so.1",
    "libc.so.6",
    "libdl.so.2",
    "libgcc_s.so.1",
    "libm.so.6",
    "libpthread.so.0",
    "libresolv.so.2",
    "librt.so.1",
    "libutil.so.1",
}
_LDD_PATH = re.compile(r"(?:=>\s+)?(/[^\s]+)")
_FIXED_ZIP_TIME = (2023, 1, 1, 0, 0, 0)


def _sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _run_version(command, env):
    completed = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    lines = (completed.stdout + "\n" + completed.stderr).splitlines()
    return next(line.strip() for line in lines if line.strip())


def _dependencies(path, env):
    completed = subprocess.run(
        ["ldd", str(path)],
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    dependencies = []
    for line in completed.stdout.splitlines():
        match = _LDD_PATH.search(line)
        if not match:
            continue
        dependency = Path(match.group(1))
        if dependency.name not in _SYSTEM_RUNTIME_LIBRARIES:
            dependencies.append(dependency)
    return dependencies


def _copy_runtime(prefix, layer_root):
    bin_dir = layer_root / "bin"
    lib_dir = layer_root / "lib"
    bin_dir.mkdir(parents=True)
    lib_dir.mkdir(parents=True)

    source_bins = [
        prefix / "bin" / "tesseract",
        prefix / "bin" / "pdftoppm",
        prefix / "bin" / "pdfinfo",
    ]
    for source in source_bins:
        shutil.copy2(source, bin_dir / source.name)

    env = dict(os.environ)
    prefix_libraries = [
        str(prefix / "lib64"),
        str(prefix / "lib"),
        env.get("LD_LIBRARY_PATH", ""),
    ]
    env["LD_LIBRARY_PATH"] = ":".join(value for value in prefix_libraries if value)

    queue = list(source_bins)
    copied = {}
    visited = set()
    while queue:
        target = queue.pop()
        resolved_target = target.resolve()
        if resolved_target in visited:
            continue
        visited.add(resolved_target)
        for dependency in _dependencies(target, env):
            resolved_dependency = dependency.resolve()
            destination_name = dependency.name
            prior = copied.get(destination_name)
            if prior and prior != resolved_dependency:
                raise RuntimeError(
                    f"Conflicting runtime libraries named {destination_name}: "
                    f"{prior} and {resolved_dependency}"
                )
            if not prior:
                shutil.copy2(resolved_dependency, lib_dir / destination_name)
                copied[destination_name] = resolved_dependency
                queue.append(dependency)

    for executable in bin_dir.iterdir():
        executable.chmod(0o755)
    for library in lib_dir.iterdir():
        library.chmod(0o644)
    return env


def _source_component(name):
    upper_name = name.upper()
    return {
        "version": os.environ[f"{upper_name}_VERSION"],
        "source_url": os.environ[f"{upper_name}_SOURCE_URL"],
        "source_sha256": os.environ[f"{upper_name}_SOURCE_SHA256"],
    }


def _write_manifest(layer_root, env):
    tesseract = layer_root / "bin" / "tesseract"
    pdftoppm = layer_root / "bin" / "pdftoppm"
    runtime_env = dict(env)
    runtime_env["LD_LIBRARY_PATH"] = str(layer_root / "lib")
    runtime_env["TESSDATA_PREFIX"] = str(layer_root / "tessdata")

    library_files = sorted((layer_root / "lib").iterdir())
    manifest = {
        "schema_version": 1,
        "privacy": (
            "Runtime-only diagnostic metadata. Contains no elector data, OCR "
            "text, filenames, input paths, names, or addresses."
        ),
        "artifact": {
            "name": "tesseract5-al2023-python312-x86_64",
            "target_runtime": os.environ["TARGET_RUNTIME"],
            "target_architecture": os.environ["TARGET_ARCHITECTURE"],
            "base_image": os.environ["LAMBDA_BASE_IMAGE"],
            "base_os": os.environ["LAMBDA_BASE_OS"],
            "source_date_epoch": int(os.environ["SOURCE_DATE_EPOCH"]),
        },
        "components": {
            "tesseract": {
                **_source_component("tesseract"),
                "runtime_version": _run_version(
                    [str(tesseract), "--version"], runtime_env
                ),
                "binary_sha256": _sha256(tesseract),
            },
            "leptonica": _source_component("leptonica"),
            "poppler": {
                **_source_component("poppler"),
                "runtime_version": _run_version(
                    [str(pdftoppm), "-v"], runtime_env
                ),
                "pdftoppm_sha256": _sha256(pdftoppm),
            },
            "trained_data": {
                "source_commit": os.environ["TESSDATA_COMMIT"],
                "eng": {
                    "sha256": _sha256(layer_root / "tessdata" / "eng.traineddata")
                },
                "osd": {
                    "sha256": _sha256(layer_root / "tessdata" / "osd.traineddata")
                },
            },
        },
        "runtime_libraries": [
            {
                "name": path.name,
                "sha256": _sha256(path),
            }
            for path in library_files
        ],
    }
    manifest_bytes = (
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    (layer_root / "ocr-runtime-manifest.json").write_bytes(manifest_bytes)
    return manifest


def _zip_layer(layer_root, output_zip):
    output_zip.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(
        output_zip,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for path in sorted(layer_root.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(layer_root).as_posix()
            info = zipfile.ZipInfo(relative, _FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            mode = 0o755 if relative.startswith("bin/") else 0o644
            info.external_attr = (stat.S_IFREG | mode) << 16
            archive.writestr(info, path.read_bytes(), compresslevel=9)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prefix", required=True, type=Path)
    parser.add_argument("--trained-data", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    output_root = args.output.resolve()
    layer_root = output_root / "layer" / "opt"
    if output_root.exists():
        shutil.rmtree(output_root)
    layer_root.mkdir(parents=True)

    runtime_env = _copy_runtime(args.prefix.resolve(), layer_root)
    tessdata_dir = layer_root / "tessdata"
    tessdata_dir.mkdir()
    for name in ("eng.traineddata", "osd.traineddata"):
        shutil.copy2(args.trained_data / name, tessdata_dir / name)

    manifest = _write_manifest(layer_root, runtime_env)
    output_zip = output_root / "tesseract5-al2023-python312-x86_64.zip"
    _zip_layer(layer_root, output_zip)
    artifact_summary = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "zip_sha256": _sha256(output_zip),
        "zip_bytes": output_zip.stat().st_size,
        "uncompressed_layer_bytes": sum(
            path.stat().st_size for path in layer_root.rglob("*") if path.is_file()
        ),
        "runtime": manifest,
    }
    (output_root / "artifact-manifest.json").write_text(
        json.dumps(artifact_summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(artifact_summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
