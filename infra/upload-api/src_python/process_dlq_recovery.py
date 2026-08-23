#!/usr/bin/env python3
"""Safely recover ProcessDLQ messages without replaying duplicate work.

The processing queue is an SQS standard queue, so the same logical job may be
present in the DLQ more than once. A direct SQS redrive would replay every copy.
This tool instead:

1. takes a bounded snapshot of the DLQ;
2. groups duplicate splitter messages and identical chunk messages;
3. checks the current DynamoDB job status and source S3 object;
4. sends one copy of each recoverable logical message to ProcessQueue; and
5. only then deletes the corresponding DLQ copies.

It is a dry run unless ``--apply`` is supplied. Dry runs immediately release
the temporarily-held DLQ messages.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Any, Iterable

import boto3


DEFAULT_STACK_NAME = "ps-upload-api-prod"
DEFAULT_REGION = "eu-west-2"
DEFAULT_VISIBILITY_TIMEOUT = 300
DEFAULT_MAX_MESSAGES = 1000
RECOVERABLE_JOB_STATUSES = frozenset({"PENDING", "QUEUED"})
TERMINAL_JOB_STATUSES = frozenset({"SUCCEEDED", "FAILED"})


@dataclass(frozen=True)
class HeldMessage:
    message_id: str
    receipt_handle: str
    body_text: str
    body: dict[str, Any] | None


@dataclass(frozen=True)
class RecoveryGroup:
    identity: tuple[Any, ...]
    job_id: str | None
    messages: tuple[HeldMessage, ...]
    body: dict[str, Any] | None
    status: str | None
    action: str
    reason: str


class BatchOperationError(RuntimeError):
    """Describe which messages settled before an SQS batch operation failed."""

    def __init__(
        self,
        operation: str,
        successful: Iterable[HeldMessage],
        unsettled: Iterable[HeldMessage],
        cause: Exception | None = None,
    ) -> None:
        self.operation = operation
        self.successful = tuple(successful)
        self.unsettled = tuple(unsettled)
        self.cause = cause
        detail = f" after {type(cause).__name__}" if cause is not None else ""
        super().__init__(
            f"SQS {operation} failed{detail}; "
            f"{len(self.successful)} message(s) settled and "
            f"{len(self.unsettled)} remain unsettled"
        )


def _parse_body(body_text: str) -> dict[str, Any] | None:
    try:
        body = json.loads(body_text)
    except (TypeError, json.JSONDecodeError):
        return None
    return body if isinstance(body, dict) else None


def make_held_message(raw: dict[str, Any]) -> HeldMessage:
    body_text = raw.get("Body")
    if not isinstance(body_text, str):
        body_text = ""
    return HeldMessage(
        message_id=str(raw.get("MessageId") or ""),
        receipt_handle=str(raw.get("ReceiptHandle") or ""),
        body_text=body_text,
        body=_parse_body(body_text),
    )


def logical_identity(message: HeldMessage) -> tuple[Any, ...]:
    """Return the unit of work that may safely be deduplicated.

    Splitter messages are one logical operation per job. Chunk messages must
    retain one copy per page range, because different chunks of the same job
    are independent work.
    """
    body = message.body
    if not body:
        return ("invalid", message.message_id)

    job_id = body.get("jobId")
    if not isinstance(job_id, str) or not job_id.strip():
        return ("invalid", message.message_id)

    if "pageStart" not in body:
        return ("splitter", job_id)

    return (
        "chunk",
        job_id,
        body.get("chunkIndex"),
        body.get("pageStart"),
        body.get("pageEnd"),
        body.get("totalChunks"),
    )


def _canonical_body(body: dict[str, Any] | None) -> str:
    return json.dumps(body, sort_keys=True, separators=(",", ":"))


def build_recovery_plan(
    messages: Iterable[HeldMessage],
    jobs_by_id: dict[str, dict[str, Any]],
    selected_job_ids: set[str] | None = None,
) -> list[RecoveryGroup]:
    grouped: dict[tuple[Any, ...], list[HeldMessage]] = {}
    for message in messages:
        grouped.setdefault(logical_identity(message), []).append(message)

    plan: list[RecoveryGroup] = []
    for identity, copies in grouped.items():
        first = copies[0]
        body = first.body
        job_id = body.get("jobId") if body else None
        job_id = job_id if isinstance(job_id, str) and job_id else None

        if identity[0] == "invalid":
            plan.append(
                RecoveryGroup(
                    identity, job_id, tuple(copies), body, None, "hold",
                    "message body is not a JSON object with a jobId",
                )
            )
            continue

        if selected_job_ids is not None and job_id not in selected_job_ids:
            plan.append(
                RecoveryGroup(
                    identity, job_id, tuple(copies), body, None, "hold",
                    "job was not selected",
                )
            )
            continue

        canonical_bodies = {_canonical_body(copy.body) for copy in copies}
        if len(canonical_bodies) != 1:
            plan.append(
                RecoveryGroup(
                    identity, job_id, tuple(copies), body, None, "hold",
                    "duplicate logical messages have different payloads",
                )
            )
            continue

        job = jobs_by_id.get(job_id or "")
        if not job:
            plan.append(
                RecoveryGroup(
                    identity, job_id, tuple(copies), body, None, "hold",
                    "job does not exist in DynamoDB",
                )
            )
            continue

        status = str(job.get("status") or "").upper()
        if status in TERMINAL_JOB_STATUSES:
            plan.append(
                RecoveryGroup(
                    identity, job_id, tuple(copies), body, status, "delete",
                    f"job is already {status}",
                )
            )
            continue

        if status not in RECOVERABLE_JOB_STATUSES:
            plan.append(
                RecoveryGroup(
                    identity, job_id, tuple(copies), body, status, "hold",
                    f"job status {status or '<missing>'} is not safe to replay",
                )
            )
            continue

        bucket = body.get("bucket") if body else None
        s3_key = body.get("s3Key") if body else None
        if not isinstance(bucket, str) or not bucket or not isinstance(s3_key, str) or not s3_key:
            plan.append(
                RecoveryGroup(
                    identity, job_id, tuple(copies), body, status, "hold",
                    "recoverable message is missing bucket or s3Key",
                )
            )
            continue

        plan.append(
            RecoveryGroup(
                identity, job_id, tuple(copies), body, status, "requeue",
                f"job is {status}; replay one of {len(copies)} DLQ copy/copies",
            )
        )

    return sorted(plan, key=lambda group: tuple(str(part) for part in group.identity))


def _stack_outputs(cloudformation: Any, stack_name: str) -> dict[str, str]:
    response = cloudformation.describe_stacks(StackName=stack_name)
    stacks = response.get("Stacks") or []
    if not stacks:
        raise RuntimeError(f"CloudFormation stack {stack_name!r} was not found")
    return {
        output["OutputKey"]: output["OutputValue"]
        for output in stacks[0].get("Outputs") or []
        if output.get("OutputKey") and output.get("OutputValue")
    }


def _required_output(outputs: dict[str, str], key: str) -> str:
    value = outputs.get(key)
    if not value:
        raise RuntimeError(f"CloudFormation output {key!r} is missing")
    return value


def snapshot_dlq(
    sqs: Any,
    queue_url: str,
    visibility_timeout: int,
    max_messages: int,
) -> list[HeldMessage]:
    attributes = sqs.get_queue_attributes(
        QueueUrl=queue_url,
        AttributeNames=["ApproximateNumberOfMessages"],
    ).get("Attributes") or {}
    visible_at_start = int(attributes.get("ApproximateNumberOfMessages") or 0)
    if visible_at_start > max_messages:
        raise RuntimeError(
            f"DLQ has approximately {visible_at_start} visible messages, above "
            f"the --max-messages safety limit of {max_messages}"
        )

    target = visible_at_start
    held: list[HeldMessage] = []
    empty_receives = 0

    try:
        while len(held) < target and empty_receives < 3:
            response = sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=min(10, target - len(held)),
                VisibilityTimeout=visibility_timeout,
                WaitTimeSeconds=1,
                AttributeNames=["All"],
                MessageAttributeNames=["All"],
            )
            raw_messages = response.get("Messages") or []
            if not raw_messages:
                empty_receives += 1
                continue
            empty_receives = 0
            held.extend(make_held_message(raw) for raw in raw_messages)

        if len(held) < visible_at_start:
            raise RuntimeError(
                f"Could only hold {len(held)} of approximately {visible_at_start} "
                "visible DLQ messages; retry when the queue is stable"
            )

        # ApproximateNumberOfMessages may undercount. Probe after reaching the
        # advertised target and fail closed if any additional visible message
        # exists; the extra receipt is included in cleanup below.
        for _probe in range(3):
            response = sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=1,
                VisibilityTimeout=visibility_timeout,
                WaitTimeSeconds=1,
                AttributeNames=["All"],
                MessageAttributeNames=["All"],
            )
            raw_messages = response.get("Messages") or []
            if raw_messages:
                held.extend(make_held_message(raw) for raw in raw_messages)
                raise RuntimeError(
                    "DLQ contained more visible messages than its approximate "
                    "starting count; all received messages were released"
                )
    except Exception as exc:
        if held:
            try:
                release_messages(sqs, queue_url, held)
            except BatchOperationError as release_exc:
                raise RuntimeError(
                    f"{exc}; additionally failed to release "
                    f"{len(release_exc.unsettled)} DLQ message(s)"
                ) from exc
        raise
    return held


def load_jobs(table: Any, messages: Iterable[HeldMessage]) -> dict[str, dict[str, Any]]:
    job_ids = {
        message.body["jobId"]
        for message in messages
        if message.body and isinstance(message.body.get("jobId"), str)
    }
    jobs: dict[str, dict[str, Any]] = {}
    for job_id in sorted(job_ids):
        response = table.get_item(
            Key={"jobId": job_id},
            ConsistentRead=True,
            ProjectionExpression="jobId, #status",
            ExpressionAttributeNames={"#status": "status"},
        )
        item = response.get("Item")
        if item:
            jobs[job_id] = item
    return jobs


def _run_batch_operation(
    sqs: Any,
    queue_url: str,
    messages: Iterable[HeldMessage],
    operation: str,
) -> tuple[HeldMessage, ...]:
    pending = list(messages)
    missing_receipts = [message for message in pending if not message.receipt_handle]
    if missing_receipts:
        raise BatchOperationError(operation, (), pending)

    successful: list[HeldMessage] = []
    for offset in range(0, len(pending), 10):
        batch = pending[offset:offset + 10]
        by_id = {str(index): message for index, message in enumerate(batch)}
        entries = [
            {
                "Id": entry_id,
                "ReceiptHandle": message.receipt_handle,
                **({"VisibilityTimeout": 0} if operation == "release" else {}),
            }
            for entry_id, message in by_id.items()
        ]
        try:
            if operation == "release":
                response = sqs.change_message_visibility_batch(
                    QueueUrl=queue_url,
                    Entries=entries,
                )
            elif operation == "delete":
                response = sqs.delete_message_batch(
                    QueueUrl=queue_url,
                    Entries=entries,
                )
            else:
                raise ValueError(f"Unsupported SQS batch operation: {operation}")
        except Exception as exc:
            raise BatchOperationError(
                operation,
                successful,
                pending[offset:],
                cause=exc,
            ) from exc

        try:
            successful_ids = {
                str(item.get("Id"))
                for item in response.get("Successful") or []
                if item.get("Id") is not None
            }
        except (AttributeError, TypeError) as exc:
            raise BatchOperationError(
                operation,
                successful,
                pending[offset:],
                cause=exc,
            ) from exc
        current_successes = [
            message for entry_id, message in by_id.items()
            if entry_id in successful_ids
        ]
        successful.extend(current_successes)
        unsettled_current = [
            message for entry_id, message in by_id.items()
            if entry_id not in successful_ids
        ]
        if unsettled_current:
            raise BatchOperationError(
                operation,
                successful,
                [*unsettled_current, *pending[offset + len(batch):]],
            )
    return tuple(successful)


def release_messages(
    sqs: Any,
    queue_url: str,
    messages: Iterable[HeldMessage],
) -> tuple[HeldMessage, ...]:
    return _run_batch_operation(sqs, queue_url, messages, "release")


def delete_messages(
    sqs: Any,
    queue_url: str,
    messages: Iterable[HeldMessage],
) -> tuple[HeldMessage, ...]:
    return _run_batch_operation(sqs, queue_url, messages, "delete")


def validate_sources(s3: Any, plan: list[RecoveryGroup]) -> list[RecoveryGroup]:
    validated: list[RecoveryGroup] = []
    for group in plan:
        if group.action != "requeue":
            validated.append(group)
            continue
        try:
            s3.head_object(Bucket=group.body["bucket"], Key=group.body["s3Key"])
        except Exception as exc:
            error_code = (
                getattr(exc, "response", {}).get("Error", {}).get("Code")
                or type(exc).__name__
            )
            validated.append(
                RecoveryGroup(
                    group.identity,
                    group.job_id,
                    group.messages,
                    group.body,
                    group.status,
                    "hold",
                    f"source S3 object is unavailable ({error_code})",
                )
            )
        else:
            validated.append(group)
    return validated


def print_plan(plan: Iterable[RecoveryGroup]) -> None:
    for group in plan:
        kind = str(group.identity[0])
        print(
            f"[{group.action.upper():7}] job={group.job_id or '<invalid>'} "
            f"kind={kind} copies={len(group.messages)} — {group.reason}"
        )


def execute_plan(
    sqs: Any,
    dlq_url: str,
    process_queue_url: str,
    plan: list[RecoveryGroup],
) -> tuple[int, int, int]:
    requeued = 0
    deleted = 0
    held = 0
    unsettled = {
        id(message): message
        for group in plan
        for message in group.messages
    }

    def settle(operation: str, messages: tuple[HeldMessage, ...]) -> None:
        action = release_messages if operation == "release" else delete_messages
        try:
            successful = action(sqs, dlq_url, messages)
        except BatchOperationError as exc:
            for message in exc.successful:
                unsettled.pop(id(message), None)
            raise
        for message in successful:
            unsettled.pop(id(message), None)

    try:
        for group in plan:
            if group.action == "hold":
                settle("release", group.messages)
                held += len(group.messages)
                continue

            if group.action == "requeue":
                # Send first. If deletion then fails, a later retry can duplicate
                # work but cannot lose it. Both handlers are idempotent.
                sqs.send_message(
                    QueueUrl=process_queue_url,
                    MessageBody=group.messages[0].body_text,
                )
                requeued += 1

            settle("delete", group.messages)
            deleted += len(group.messages)
    except Exception as exc:
        remaining = tuple(unsettled.values())
        if remaining:
            try:
                released = release_messages(sqs, dlq_url, remaining)
            except BatchOperationError as release_exc:
                for message in release_exc.successful:
                    unsettled.pop(id(message), None)
                raise RuntimeError(
                    f"{exc}; additionally failed to release "
                    f"{len(unsettled)} unsettled DLQ message(s)"
                ) from exc
            else:
                for message in released:
                    unsettled.pop(id(message), None)
        raise

    return requeued, deleted, held


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stack-name", default=DEFAULT_STACK_NAME)
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--apply", action="store_true", help="Requeue/delete according to the printed plan")
    parser.add_argument(
        "--job-id",
        action="append",
        dest="job_ids",
        help="Limit recovery to this job ID; may be repeated",
    )
    parser.add_argument("--visibility-timeout", type=int, default=DEFAULT_VISIBILITY_TIMEOUT)
    parser.add_argument("--max-messages", type=int, default=DEFAULT_MAX_MESSAGES)
    parser.add_argument(
        "--no-verify-ssl",
        action="store_true",
        help="Disable TLS certificate verification (only for a locally-intercepted AWS connection)",
    )
    args = parser.parse_args(argv)
    if args.visibility_timeout < 30:
        parser.error("--visibility-timeout must be at least 30 seconds")
    if args.max_messages < 1:
        parser.error("--max-messages must be positive")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    verify = not args.no_verify_ssl
    if not verify:
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    client_kwargs = {"region_name": args.region, "verify": verify}
    cloudformation = boto3.client("cloudformation", **client_kwargs)
    sqs = boto3.client("sqs", **client_kwargs)
    s3 = boto3.client("s3", **client_kwargs)
    dynamodb = boto3.resource("dynamodb", **client_kwargs)

    outputs = _stack_outputs(cloudformation, args.stack_name)
    dlq_url = _required_output(outputs, "ProcessDlqUrl")
    process_queue_url = _required_output(outputs, "ProcessQueueUrl")
    jobs_table_name = _required_output(outputs, "JobsTableName")

    held_messages: list[HeldMessage] = []
    try:
        held_messages = snapshot_dlq(
            sqs,
            dlq_url,
            visibility_timeout=args.visibility_timeout,
            max_messages=args.max_messages,
        )
        jobs = load_jobs(dynamodb.Table(jobs_table_name), held_messages)
        selected = set(args.job_ids) if args.job_ids else None
        plan = build_recovery_plan(held_messages, jobs, selected)
        plan = validate_sources(s3, plan)

        print(
            f"DLQ snapshot: {len(held_messages)} message(s), "
            f"{len(plan)} logical group(s)"
        )
        print_plan(plan)

        if not args.apply:
            try:
                release_messages(sqs, dlq_url, held_messages)
            except BatchOperationError as exc:
                held_messages = list(exc.unsettled)
                raise
            else:
                held_messages = []
            print("Dry run only; all messages were released back to the DLQ.")
            return 0

        # Transfer cleanup ownership to execute_plan. It tracks successful
        # releases/deletions and only releases receipts that remain unsettled.
        held_messages = []
        requeued, deleted, held = execute_plan(
            sqs, dlq_url, process_queue_url, plan
        )
        held_messages = []
        print(
            f"Applied: requeued={requeued} logical message(s), "
            f"deleted={deleted} DLQ copy/copies, held={held}"
        )
        return 0 if held == 0 else 2
    except Exception as exc:
        print(f"Recovery failed: {exc}", file=sys.stderr)
        if held_messages:
            try:
                release_messages(sqs, dlq_url, held_messages)
            except BatchOperationError as release_exc:
                print(
                    "Additionally failed to release "
                    f"{len(release_exc.unsettled)} held message(s).",
                    file=sys.stderr,
                )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
