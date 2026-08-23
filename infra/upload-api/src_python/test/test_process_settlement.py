"""Fault-injection tests for idempotent batch settlement."""

import pytest
from botocore.exceptions import ClientError

import process_register.handler as h


def _conditional_failure():
    return ClientError(
        {
            "Error": {
                "Code": "ConditionalCheckFailedException",
                "Message": "condition failed",
            }
        },
        "UpdateItem",
    )


class _BatchTable:
    def __init__(self):
        self.item = {}

    def update_item(self, **kwargs):
        expression = kwargs["UpdateExpression"]
        values = kwargs.get("ExpressionAttributeValues") or {}

        if expression.startswith("ADD completedJobs"):
            job_id = values[":job"]
            completed_jobs = self.item.setdefault("completedJobs", set())
            if job_id in completed_jobs:
                raise _conditional_failure()
            completed_jobs.add(job_id)
            self.item["completedCount"] = (
                int(self.item.get("completedCount", 0)) + 1
            )
            self.item.setdefault("totalFiles", int(values[":tf"]))
            return {"Attributes": dict(self.item)}

        if expression.startswith("SET combinerInvoked = :claim"):
            can_claim = "combinerInvoked" not in self.item
            if (
                not can_claim
                and "combinerAcceptedAt" not in self.item
                and "combinerClaimedAt" in self.item
            ):
                can_claim = (
                    int(self.item["combinerClaimedAt"])
                    < int(values[":stale_before"])
                )
            if not can_claim:
                raise _conditional_failure()
            self.item["combinerInvoked"] = values[":claim"]
            self.item["combinerClaimedAt"] = values[":claimed_at"]
            self.item.pop("combinerAcceptedAt", None)
            return {}

        if expression.startswith("REMOVE combinerInvoked"):
            if self.item.get("combinerInvoked") != values[":claim"]:
                raise _conditional_failure()
            self.item.pop("combinerInvoked", None)
            self.item.pop("combinerClaimedAt", None)
            return {}

        if expression == "SET combinerAcceptedAt = :accepted_at":
            if self.item.get("combinerInvoked") != values[":claim"]:
                raise _conditional_failure()
            self.item["combinerAcceptedAt"] = values[":accepted_at"]
            return {}

        raise AssertionError(f"Unexpected update expression: {expression}")

    def get_item(self, **_kwargs):
        return {"Item": dict(self.item)}


class _Dynamo:
    def __init__(self, table):
        self.table = table

    def Table(self, _name):
        return self.table


class _ChunkTable:
    def __init__(self):
        self.item = {"totalChunks": 1}

    def update_item(self, **kwargs):
        expression = kwargs["UpdateExpression"]
        if not expression.startswith("ADD settledChunks"):
            raise AssertionError(f"Unexpected update expression: {expression}")
        values = kwargs["ExpressionAttributeValues"]
        chunk_index = int(values[":chunk_index"])
        settled = self.item.setdefault("settledChunks", set())
        if chunk_index in settled:
            raise _conditional_failure()
        settled.add(chunk_index)
        if "failedChunks" in expression:
            self.item.setdefault("failedChunks", set()).add(chunk_index)
        return {"Attributes": dict(self.item)}

    def get_item(self, **_kwargs):
        return {"Item": dict(self.item)}


class _Lambda:
    def __init__(self, failures=0):
        self.failures = failures
        self.calls = []

    def invoke(self, **kwargs):
        self.calls.append(kwargs)
        if self.failures:
            self.failures -= 1
            raise RuntimeError("temporary invoke failure")
        return {"StatusCode": 202}


def _arrange(monkeypatch, *, invoke_failures=0):
    table = _BatchTable()
    lambda_client = _Lambda(failures=invoke_failures)
    monkeypatch.setattr(h, "dynamo", _Dynamo(table))
    monkeypatch.setattr(h, "lambda_client", lambda_client)
    monkeypatch.setattr(h, "JOBS_TABLE", "jobs")
    monkeypatch.setattr(h, "COMBINE_FUNCTION_ARN", "combine-function")
    return table, lambda_client


def test_repeated_job_completion_cannot_increment_batch_twice(monkeypatch):
    table, lambda_client = _arrange(monkeypatch)

    h.try_trigger_combiner("batch-1", 2, {"batchId": "batch-1"}, "job-1")
    h.try_trigger_combiner("batch-1", 2, {"batchId": "batch-1"}, "job-1")

    assert table.item["completedCount"] == 1
    assert table.item["completedJobs"] == {"job-1"}
    assert lambda_client.calls == []

    h.try_trigger_combiner("batch-1", 2, {"batchId": "batch-1"}, "job-2")
    h.try_trigger_combiner("batch-1", 2, {"batchId": "batch-1"}, "job-2")

    assert table.item["completedCount"] == 2
    assert table.item["completedJobs"] == {"job-1", "job-2"}
    assert len(lambda_client.calls) == 1


def test_invoke_failure_releases_only_own_claim_and_retry_does_not_recount(
    monkeypatch,
):
    table, lambda_client = _arrange(monkeypatch, invoke_failures=1)

    with pytest.raises(RuntimeError, match="temporary invoke failure"):
        h.try_trigger_combiner(
            "batch-1", 1, {"batchId": "batch-1"}, "job-1"
        )

    assert table.item["completedCount"] == 1
    assert "combinerInvoked" not in table.item

    h.try_trigger_combiner(
        "batch-1", 1, {"batchId": "batch-1"}, "job-1"
    )

    assert table.item["completedCount"] == 1
    assert len(lambda_client.calls) == 2
    assert "combinerInvoked" in table.item


def test_legacy_batch_counted_job_checks_readiness_without_increment(
    monkeypatch,
):
    table, lambda_client = _arrange(monkeypatch)
    table.item.update({"completedCount": 1, "totalFiles": 1})

    h.try_trigger_combiner(
        "batch-1",
        1,
        {"batchId": "batch-1"},
        "job-1",
        count_completion=False,
    )

    assert table.item["completedCount"] == 1
    assert "completedJobs" not in table.item
    assert len(lambda_client.calls) == 1


def test_stale_unaccepted_combiner_claim_is_recovered(monkeypatch):
    table, lambda_client = _arrange(monkeypatch)
    now = 50_000
    monkeypatch.setattr(h.time, "time", lambda: now)
    table.item.update({
        "completedCount": 1,
        "totalFiles": 1,
        "completedJobs": {"job-1"},
        "combinerInvoked": "abandoned-claim",
        "combinerClaimedAt": now - h.COMBINER_CLAIM_STALE_SECONDS - 1,
    })

    h.try_trigger_combiner(
        "batch-1", 1, {"batchId": "batch-1"}, "job-1"
    )

    assert len(lambda_client.calls) == 1
    assert table.item["combinerInvoked"] != "abandoned-claim"
    assert table.item["combinerAcceptedAt"] == now


def test_fresh_unaccepted_combiner_claim_requests_retry(monkeypatch):
    table, lambda_client = _arrange(monkeypatch)
    now = 50_000
    monkeypatch.setattr(h.time, "time", lambda: now)
    table.item.update({
        "completedCount": 1,
        "totalFiles": 1,
        "completedJobs": {"job-1"},
        "combinerInvoked": "active-claim",
        "combinerClaimedAt": now,
    })

    with pytest.raises(RuntimeError, match="claimed but not yet accepted"):
        h.try_trigger_combiner(
            "batch-1", 1, {"batchId": "batch-1"}, "job-1"
        )

    assert lambda_client.calls == []


def test_first_chunk_settlement_outcome_wins_on_redelivery(monkeypatch):
    table = _ChunkTable()
    succeeded = []
    failed = []
    monkeypatch.setattr(h, "dynamo", _Dynamo(table))
    monkeypatch.setattr(h, "JOBS_TABLE", "jobs")
    monkeypatch.setattr(
        h,
        "update_job_succeeded",
        lambda *args: succeeded.append(args),
    )
    monkeypatch.setattr(
        h,
        "update_job_failed",
        lambda *args: failed.append(args),
    )

    assert h.try_finalise_job(
        "job-1", 0, "", 1, {}, "outputs/job-1", chunk_failed=False
    )
    assert h.try_finalise_job(
        "job-1", 0, "", 1, {}, "outputs/job-1", chunk_failed=True
    )

    assert table.item["settledChunks"] == {0}
    assert table.item.get("failedChunks", set()) == set()
    assert len(succeeded) == 2
    assert failed == []
