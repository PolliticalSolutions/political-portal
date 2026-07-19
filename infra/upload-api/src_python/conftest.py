"""Pytest bootstrap for the marked-register OCR pipeline tests.

Puts src_python/ on sys.path so `process_register.handler` and
`combine_register.handler` import as top-level packages, and sets the
environment variables the handler modules read at import time so their
boto3 clients construct cleanly. No AWS calls are made — the tests exercise
the pure functions only, and Tesseract/pdf2image are optional (guarded by
OCR_AVAILABLE in the handler).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

os.environ.setdefault("AWS_REGION", "eu-west-2")
os.environ.setdefault("AWS_DEFAULT_REGION", "eu-west-2")
os.environ.setdefault("JOBS_TABLE", "test-jobs")
os.environ.setdefault("UPLOADS_BUCKET", "test-bucket")
os.environ.setdefault("COMBINE_FUNCTION_ARN", "arn:aws:lambda:eu-west-2:000:function:combine")
os.environ.setdefault("PROCESS_QUEUE_URL", "https://sqs.eu-west-2.amazonaws.com/000/process-queue")
