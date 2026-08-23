#!/usr/bin/env bash
# Build a pinned Tesseract 5.3.0 + Poppler 22.12.0 layer in the official
# Python 3.12 Lambda/Amazon Linux 2023 image.
#
# The build downloads hash-pinned source inputs into ocr_layer/.sources, then
# exports both a deterministic layer zip and an unpacked tree for local parity.
#
# Usage:
#   ./build_layer.sh [--insecure-amazonlinux-repo]
#
# The insecure option is only for managed machines whose TLS interception is
# not trusted inside Docker. Normal repository certificate verification is the
# default.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAYER_DIR="$SCRIPT_DIR/ocr_layer"
VERSIONS_FILE="$LAYER_DIR/versions.env"
SOURCE_DIR="$LAYER_DIR/.sources"
OUTPUT_DIR="$LAYER_DIR/out"
AL2023_REPO_SSLVERIFY=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --insecure-amazonlinux-repo)
      AL2023_REPO_SSLVERIFY=0
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

# shellcheck disable=SC1090
source "$VERSIONS_FILE"

download_and_verify() {
  local url="$1"
  local destination="$2"
  local expected_sha256="$3"

  mkdir -p "$SOURCE_DIR"
  if [[ -f "$destination" ]]; then
    local actual
    actual="$(sha256sum "$destination" | awk '{print $1}')"
    if [[ "$actual" == "$expected_sha256" ]]; then
      echo "Using verified cached input: $(basename "$destination")"
      return
    fi
    rm -f -- "$destination"
  fi

  echo "Downloading: $url"
  curl --fail --location --proto '=https' --tlsv1.2 \
    --output "$destination.part" "$url"
  echo "$expected_sha256  $destination.part" | sha256sum --check -
  mv -f -- "$destination.part" "$destination"
}

download_and_verify \
  "$TESSERACT_SOURCE_URL" \
  "$SOURCE_DIR/tesseract-$TESSERACT_VERSION.tar.gz" \
  "$TESSERACT_SOURCE_SHA256"
download_and_verify \
  "$LEPTONICA_SOURCE_URL" \
  "$SOURCE_DIR/leptonica-$LEPTONICA_VERSION.tar.gz" \
  "$LEPTONICA_SOURCE_SHA256"
download_and_verify \
  "$POPPLER_SOURCE_URL" \
  "$SOURCE_DIR/poppler-$POPPLER_VERSION.tar.xz" \
  "$POPPLER_SOURCE_SHA256"
download_and_verify \
  "$ENG_TRAINEDDATA_URL" \
  "$SOURCE_DIR/eng.traineddata" \
  "$ENG_TRAINEDDATA_SHA256"
download_and_verify \
  "$OSD_TRAINEDDATA_URL" \
  "$SOURCE_DIR/osd.traineddata" \
  "$OSD_TRAINEDDATA_SHA256"

rm -rf -- "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

docker build \
  --platform "linux/amd64" \
  --file "$LAYER_DIR/Dockerfile" \
  --output "type=local,dest=$OUTPUT_DIR" \
  --build-arg "AL2023_REPO_SSLVERIFY=$AL2023_REPO_SSLVERIFY" \
  --build-arg "LAMBDA_BASE_IMAGE=$LAMBDA_BASE_IMAGE" \
  --build-arg "LAMBDA_BASE_OS=$LAMBDA_BASE_OS" \
  --build-arg "TARGET_RUNTIME=$TARGET_RUNTIME" \
  --build-arg "TARGET_ARCHITECTURE=$TARGET_ARCHITECTURE" \
  --build-arg "TESSERACT_VERSION=$TESSERACT_VERSION" \
  --build-arg "TESSERACT_SOURCE_URL=$TESSERACT_SOURCE_URL" \
  --build-arg "TESSERACT_SOURCE_SHA256=$TESSERACT_SOURCE_SHA256" \
  --build-arg "LEPTONICA_VERSION=$LEPTONICA_VERSION" \
  --build-arg "LEPTONICA_SOURCE_URL=$LEPTONICA_SOURCE_URL" \
  --build-arg "LEPTONICA_SOURCE_SHA256=$LEPTONICA_SOURCE_SHA256" \
  --build-arg "POPPLER_VERSION=$POPPLER_VERSION" \
  --build-arg "POPPLER_SOURCE_URL=$POPPLER_SOURCE_URL" \
  --build-arg "POPPLER_SOURCE_SHA256=$POPPLER_SOURCE_SHA256" \
  --build-arg "TESSDATA_COMMIT=$TESSDATA_COMMIT" \
  --build-arg "ENG_TRAINEDDATA_SHA256=$ENG_TRAINEDDATA_SHA256" \
  --build-arg "OSD_TRAINEDDATA_SHA256=$OSD_TRAINEDDATA_SHA256" \
  --build-arg "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH" \
  "$LAYER_DIR"

echo
echo "Layer build complete:"
echo "  $OUTPUT_DIR/tesseract5-al2023-python312-x86_64.zip"
echo "  $OUTPUT_DIR/artifact-manifest.json"
echo "  $OUTPUT_DIR/layer/opt"
