FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AWS_EC2_METADATA_DISABLED=true \
    AWS_REGION=eu-west-2 \
    AWS_DEFAULT_REGION=eu-west-2 \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata \
    LOCAL_POPPLER_PATH=/usr/bin \
    LOCAL_TESSERACT_CMD=/usr/bin/tesseract \
    LOCAL_OCR_TRIAL_STUB_AWS=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Reuse the Linux-compatible Python dependencies produced by the required SAM
# build. This avoids downloading Python packages during the privacy-safe trial
# image build and keeps TLS verification enabled on managed Windows machines.
COPY .aws-sam/build/ProcessRegisterFunction/ /usr/local/lib/python3.12/site-packages/

COPY src_python/process_register /app/process_register
COPY src_python/combine_register /app/combine_register
COPY src_python/local_gap_trial.py /app/local_gap_trial.py
COPY src_python/local_row_trial.py /app/local_row_trial.py
COPY src_python/ocr_runtime_versions.py /app/ocr_runtime_versions.py

ENTRYPOINT ["python", "/app/local_gap_trial.py"]
