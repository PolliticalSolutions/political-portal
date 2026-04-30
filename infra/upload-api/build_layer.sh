#!/bin/bash
# build_layer.sh — Build the Tesseract + poppler Lambda layer for Amazon Linux 2 (linux/amd64).
#
# Usage:
#   ./build_layer.sh [--publish] [--region eu-west-2] [--stack ps-upload-api-prod]
#
# Without --publish: builds tesseract-layer.zip in the current directory.
# With    --publish: also calls `aws lambda publish-layer-version` and prints the ARN.
#
# Prerequisites: Docker (with linux/amd64 platform support).
#
# The layer layout expected by the Lambda functions:
#   /opt/bin/tesseract
#   /opt/bin/pdftoppm
#   /opt/lib/*.so*        (shared libraries)
#   /opt/tessdata/eng.traineddata

set -euo pipefail

REGION="${REGION:-eu-west-2}"
LAYER_NAME="${LAYER_NAME:-tesseract-layer}"
PUBLISH=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish)     PUBLISH=true; shift ;;
    --region)      REGION="$2"; shift 2 ;;
    --layer-name)  LAYER_NAME="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_ZIP="$SCRIPT_DIR/tesseract-layer.zip"

echo "==> Building Tesseract Lambda layer (linux/amd64) ..."
echo "    Output: $OUT_ZIP"

docker run --rm --platform linux/amd64 \
  -v "$SCRIPT_DIR":/host \
  amazonlinux:2 \
  bash -c '
    set -euo pipefail

    yum install -y amazon-linux-extras 2>/dev/null || true
    amazon-linux-extras enable epel 2>/dev/null || true
    yum install -y epel-release 2>/dev/null || true

    # Install tesseract, poppler-utils, and required libs
    yum install -y \
      tesseract \
      poppler-utils \
      libjpeg-turbo \
      libpng \
      libtiff \
      libwebp \
      zlib \
      leptonica \
      curl \
      2>/dev/null

    LAYER_DIR=/tmp/layer
    mkdir -p "$LAYER_DIR/bin" "$LAYER_DIR/lib" "$LAYER_DIR/tessdata"

    # Copy binaries (explicit paths — `which` is not available in minimal AL2 containers)
    cp /usr/bin/tesseract "$LAYER_DIR/bin/tesseract"
    cp /usr/bin/pdftoppm  "$LAYER_DIR/bin/pdftoppm"

    # Download eng.traineddata directly (tesseract-langpack-eng not in EPEL for AL2)
    curl -fsSL \
      https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata \
      -o "$LAYER_DIR/tessdata/eng.traineddata"

    # Collect shared libraries needed by tesseract and pdftoppm
    collect_libs() {
      local bin="$1"
      ldd "$bin" 2>/dev/null | awk '"'"'/=> \// { print $3 }'"'"' | while read lib; do
        [ -f "$lib" ] && cp -n "$lib" /tmp/layer/lib/ 2>/dev/null || true
      done
    }
    collect_libs /usr/bin/tesseract
    collect_libs /usr/bin/pdftoppm

    # Make binaries executable
    chmod +x "$LAYER_DIR/bin/tesseract" "$LAYER_DIR/bin/pdftoppm"

    # Package
    cd "$LAYER_DIR"
    zip -r9 /host/tesseract-layer.zip bin/ lib/ tessdata/

    echo ""
    echo "Layer contents:"
    unzip -l /host/tesseract-layer.zip | tail -20
    echo ""
    SIZE=$(du -sh /host/tesseract-layer.zip | cut -f1)
    echo "Archive size: $SIZE"
  '

echo ""
echo "==> Build complete: $OUT_ZIP"

if [ "$PUBLISH" = true ]; then
  echo ""
  echo "==> Publishing layer to AWS Lambda (region: $REGION) ..."
  RESULT=$(aws lambda publish-layer-version \
    --layer-name "$LAYER_NAME" \
    --description "Tesseract 4 + poppler for marked register OCR" \
    --zip-file "fileb://$OUT_ZIP" \
    --compatible-runtimes python3.12 \
    --compatible-architectures x86_64 \
    --region "$REGION" \
    --output json)

  LAYER_ARN=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['LayerVersionArn'])")
  echo ""
  echo "==> Layer published!"
  echo "    ARN: $LAYER_ARN"
  echo ""
  echo "Pass this ARN to the deploy script:"
  echo "    TESSERACT_LAYER_ARN=\"$LAYER_ARN\" ./scripts/deploy-upload-api.sh ..."
fi
