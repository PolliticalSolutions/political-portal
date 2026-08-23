# Marked-register OCR layer

This directory builds the marked-register processor's native OCR layer against
the official Python 3.12 Lambda image (Amazon Linux 2023, x86_64). It does not
copy Debian executables into Lambda.

The inputs in `versions.env` are immutable image/source identities and SHA-256
checksums. The target OCR versions reproduce the successful Debian Bookworm
trial as closely as the Lambda ABI allows:

| Component | Successful local trial | Lambda layer 6 |
|---|---:|---:|
| Tesseract | 5.3.0 | 5.3.0 |
| Leptonica | 1.82.0 | 1.82.0 |
| Poppler (`pdftoppm`) | 22.12.0 | 22.12.0 |
| `eng.traineddata` SHA-256 | `7d4322bd…170b2` | `7d4322bd…170b2` |
| `osd.traineddata` SHA-256 | `9cf5d576…b00ff` | `9cf5d576…b00ff` |

## Build

On Windows:

```powershell
.\build_layer.ps1
```

On the managed machine only, Docker's AL2023 package manager does not trust the
TLS interception certificate. After first trying the normal command, use:

```powershell
.\build_layer.ps1 -InsecureAmazonLinuxRepo
```

On Bash:

```bash
./build_layer.sh
```

The Bash equivalent of the managed-machine exception is
`--insecure-amazonlinux-repo`.

The build writes ignored local outputs under `ocr_layer/out/`:

- `tesseract5-al2023-python312-x86_64.zip`
- `artifact-manifest.json`
- `layer/opt/`, the exact unpacked artifact used by local parity

The zip is assembled with sorted paths and fixed timestamps. Its embedded
`ocr-runtime-manifest.json` identifies the image, source versions, source
hashes, binary hashes, trained-data hashes, and recursive runtime libraries.
It contains no elector or input metadata.

## Production-compatible local parity

First run `sam build`, then:

```powershell
.\local_trial\run-layer-parity-trial.ps1 `
  -InputPath "C:\MarkedRegisters\Newcastle Under Lyme\Staffordshire\Division 1 - Audley & Chesterton\Marked Registers"
```

The runner mounts the unpacked layer read-only into the pinned Python 3.12
Lambda image, disables networking, and writes an aggregate-only ignored report.
Before OCR begins, it verifies that the selected PDFs match the private source
set recorded by aggregate fingerprint in `parity-baseline.json`.

The default baseline was reproduced from the exact deployed source commit
`ccb4cfd4da314407fe17c46799eb37d8a353c379` on 19 August 2026:

- 9,696 rows before deduplication
- 9,642 rows after deduplication
- 1,888 marked Y

The runner fails if any metric differs by more than 1% or if the OCR runtime
does not match its artifact manifest. Do not update the baseline merely because
a candidate differs; first establish the difference from independent private
source evidence and record the exact comparison commit.

## Operational deployment evidence

This source README deliberately excludes account IDs, function names, ARNs,
revision IDs, event-source identifiers, environment fingerprints, and
customer-output hashes. Preserve deployment and rollback evidence only in an
ignored private location such as `infra/upload-api/.ocr-artifacts/`.

Building or validating this layer does not authorise publication, function
configuration changes, rollback, or a production upload. Those operations need
their own reviewed identifiers, current revision guard, and explicit approval.
