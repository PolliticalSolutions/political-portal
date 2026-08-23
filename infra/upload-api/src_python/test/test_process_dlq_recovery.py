import json

import pytest

from process_dlq_recovery import (
    BatchOperationError,
    HeldMessage,
    build_recovery_plan,
    execute_plan,
    logical_identity,
    make_held_message,
    snapshot_dlq,
)


def _message(message_id, body):
    return make_held_message({
        "MessageId": message_id,
        "ReceiptHandle": f"receipt-{message_id}",
        "Body": json.dumps(body),
    })


def _raw_message(message_id, body):
    return {
        "MessageId": message_id,
        "ReceiptHandle": f"receipt-{message_id}",
        "Body": json.dumps(body),
    }


def _splitter(job_id="job-1", filename="register.pdf"):
    return {
        "jobId": job_id,
        "bucket": "uploads",
        "s3Key": f"uploads/{job_id}/{filename}",
    }


def _chunk(job_id, chunk_index, start, end, total=2):
    return {
        **_splitter(job_id),
        "pageStart": start,
        "pageEnd": end,
        "chunkIndex": chunk_index,
        "totalChunks": total,
    }


class TestLogicalIdentity:
    def test_splitter_identity_is_one_operation_per_job(self):
        assert logical_identity(_message("m1", _splitter())) == ("splitter", "job-1")

    def test_chunks_for_same_job_remain_distinct(self):
        first = logical_identity(_message("m1", _chunk("job-1", 0, 1, 20)))
        second = logical_identity(_message("m2", _chunk("job-1", 1, 21, 40)))
        assert first != second

    def test_invalid_json_is_never_deduplicated(self):
        first = HeldMessage("m1", "r1", "not-json", None)
        second = HeldMessage("m2", "r2", "not-json", None)
        assert logical_identity(first) == ("invalid", "m1")
        assert logical_identity(second) == ("invalid", "m2")


class TestBuildRecoveryPlan:
    def test_duplicate_splitters_requeue_once(self):
        body = _splitter()
        messages = [_message("m1", body), _message("m2", body), _message("m3", body)]
        plan = build_recovery_plan(messages, {"job-1": {"status": "PENDING"}})

        assert len(plan) == 1
        assert plan[0].action == "requeue"
        assert len(plan[0].messages) == 3

    def test_different_chunks_each_requeue_once(self):
        messages = [
            _message("m1", _chunk("job-1", 0, 1, 20)),
            _message("m2", _chunk("job-1", 1, 21, 40)),
        ]
        plan = build_recovery_plan(messages, {"job-1": {"status": "QUEUED"}})

        assert len(plan) == 2
        assert [group.action for group in plan] == ["requeue", "requeue"]

    def test_terminal_job_messages_are_deleted_without_requeue(self):
        plan = build_recovery_plan(
            [_message("m1", _splitter())],
            {"job-1": {"status": "SUCCEEDED"}},
        )
        assert plan[0].action == "delete"
        assert "already SUCCEEDED" in plan[0].reason

    def test_processing_job_is_held(self):
        plan = build_recovery_plan(
            [_message("m1", _splitter())],
            {"job-1": {"status": "PROCESSING"}},
        )
        assert plan[0].action == "hold"
        assert "not safe to replay" in plan[0].reason

    def test_missing_job_is_held(self):
        plan = build_recovery_plan([_message("m1", _splitter())], {})
        assert plan[0].action == "hold"
        assert "does not exist" in plan[0].reason

    def test_divergent_duplicate_payloads_are_held(self):
        messages = [
            _message("m1", _splitter(filename="one.pdf")),
            _message("m2", _splitter(filename="two.pdf")),
        ]
        plan = build_recovery_plan(messages, {"job-1": {"status": "PENDING"}})
        assert plan[0].action == "hold"
        assert "different payloads" in plan[0].reason

    def test_unselected_job_is_held(self):
        messages = [
            _message("m1", _splitter("job-1")),
            _message("m2", _splitter("job-2")),
        ]
        jobs = {
            "job-1": {"status": "PENDING"},
            "job-2": {"status": "PENDING"},
        }
        plan = build_recovery_plan(messages, jobs, {"job-1"})
        actions = {group.job_id: group.action for group in plan}
        assert actions == {"job-1": "requeue", "job-2": "hold"}

    def test_missing_source_fields_are_held(self):
        message = _message("m1", {"jobId": "job-1"})
        plan = build_recovery_plan([message], {"job-1": {"status": "PENDING"}})
        assert plan[0].action == "hold"
        assert "missing bucket or s3Key" in plan[0].reason


class FakeSqs:
    def __init__(
        self,
        *,
        delete_responses=None,
        release_responses=None,
        send_errors=None,
    ):
        self.calls = []
        self.delete_responses = list(delete_responses or [])
        self.release_responses = list(release_responses or [])
        self.send_errors = list(send_errors or [])

    def send_message(self, **kwargs):
        self.calls.append(("send", kwargs))
        if self.send_errors:
            raise self.send_errors.pop(0)
        return {"MessageId": "replayed"}

    def delete_message_batch(self, **kwargs):
        self.calls.append(("delete", kwargs))
        if self.delete_responses:
            return self.delete_responses.pop(0)
        return {"Successful": kwargs["Entries"]}

    def change_message_visibility_batch(self, **kwargs):
        self.calls.append(("release", kwargs))
        if self.release_responses:
            return self.release_responses.pop(0)
        return {"Successful": kwargs["Entries"]}


class SnapshotSqs(FakeSqs):
    def __init__(self, visible, receives, **kwargs):
        super().__init__(**kwargs)
        self.visible = visible
        self.receives = list(receives)

    def get_queue_attributes(self, **kwargs):
        self.calls.append(("attributes", kwargs))
        return {"Attributes": {"ApproximateNumberOfMessages": str(self.visible)}}

    def receive_message(self, **kwargs):
        self.calls.append(("receive", kwargs))
        result = self.receives.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class TestSnapshotDlq:
    def test_limit_is_checked_before_any_message_is_received(self):
        sqs = SnapshotSqs(visible=2, receives=[])

        with pytest.raises(RuntimeError, match="safety limit"):
            snapshot_dlq(sqs, "dlq-url", visibility_timeout=300, max_messages=1)

        assert [call[0] for call in sqs.calls] == ["attributes"]

    def test_incomplete_snapshot_releases_messages_already_received(self):
        sqs = SnapshotSqs(
            visible=2,
            receives=[
                {"Messages": [_raw_message("m1", _splitter())]},
                {},
                {},
                {},
            ],
        )

        with pytest.raises(RuntimeError, match="Could only hold 1"):
            snapshot_dlq(sqs, "dlq-url", visibility_timeout=300, max_messages=2)

        assert [call[0] for call in sqs.calls][-1] == "release"
        assert sqs.calls[-1][1]["Entries"][0]["ReceiptHandle"] == "receipt-m1"

    def test_receive_failure_releases_messages_already_received(self):
        sqs = SnapshotSqs(
            visible=2,
            receives=[
                {"Messages": [_raw_message("m1", _splitter())]},
                RuntimeError("receive failed"),
            ],
        )

        with pytest.raises(RuntimeError, match="receive failed"):
            snapshot_dlq(sqs, "dlq-url", visibility_timeout=300, max_messages=2)

        assert [call[0] for call in sqs.calls][-1] == "release"

    def test_snapshot_reports_cleanup_failure(self):
        sqs = SnapshotSqs(
            visible=2,
            receives=[
                {"Messages": [_raw_message("m1", _splitter())]},
                {},
                {},
                {},
            ],
            release_responses=[{"Failed": [{"Id": "0"}]}],
        )

        with pytest.raises(RuntimeError, match="additionally failed to release 1"):
            snapshot_dlq(sqs, "dlq-url", visibility_timeout=300, max_messages=2)

    def test_underestimated_count_releases_extra_message_and_fails_closed(self):
        sqs = SnapshotSqs(
            visible=1,
            receives=[
                {"Messages": [_raw_message("m1", _splitter())]},
                {"Messages": [_raw_message("m2", _splitter("job-2"))]},
            ],
        )

        with pytest.raises(RuntimeError, match="more visible messages"):
            snapshot_dlq(sqs, "dlq-url", visibility_timeout=300, max_messages=2)

        released = sqs.calls[-1][1]["Entries"]
        assert [entry["ReceiptHandle"] for entry in released] == [
            "receipt-m1",
            "receipt-m2",
        ]


class TestExecutePlan:
    def test_requeue_happens_before_dlq_delete(self):
        messages = [
            _message("m1", _splitter()),
            _message("m2", _splitter()),
        ]
        plan = build_recovery_plan(messages, {"job-1": {"status": "PENDING"}})
        sqs = FakeSqs()

        result = execute_plan(sqs, "dlq-url", "process-url", plan)

        assert result == (1, 2, 0)
        assert [call[0] for call in sqs.calls] == ["send", "delete"]
        assert sqs.calls[0][1]["MessageBody"] == messages[0].body_text

    def test_terminal_job_is_deleted_without_requeue(self):
        plan = build_recovery_plan(
            [_message("m1", _splitter())],
            {"job-1": {"status": "FAILED"}},
        )
        sqs = FakeSqs()

        result = execute_plan(sqs, "dlq-url", "process-url", plan)

        assert result == (0, 1, 0)
        assert [call[0] for call in sqs.calls] == ["delete"]

    def test_held_message_is_released_without_requeue_or_delete(self):
        plan = build_recovery_plan(
            [_message("m1", _splitter())],
            {"job-1": {"status": "PROCESSING"}},
        )
        sqs = FakeSqs()

        result = execute_plan(sqs, "dlq-url", "process-url", plan)

        assert result == (0, 0, 1)
        assert [call[0] for call in sqs.calls] == ["release"]

    def test_partial_delete_releases_only_the_undeleted_receipt(self):
        messages = [
            _message("m1", _splitter()),
            _message("m2", _splitter()),
        ]
        plan = build_recovery_plan(messages, {"job-1": {"status": "PENDING"}})
        sqs = FakeSqs(delete_responses=[{
            "Successful": [{"Id": "0"}],
            "Failed": [{"Id": "1"}],
        }])

        with pytest.raises(BatchOperationError, match="1 remain unsettled"):
            execute_plan(sqs, "dlq-url", "process-url", plan)

        assert [call[0] for call in sqs.calls] == ["send", "delete", "release"]
        released = sqs.calls[-1][1]["Entries"]
        assert [entry["ReceiptHandle"] for entry in released] == ["receipt-m2"]

    def test_later_send_failure_never_releases_an_already_deleted_message(self):
        messages = [
            _message("m1", _splitter("job-1")),
            _message("m2", _splitter("job-2")),
        ]
        plan = build_recovery_plan(
            messages,
            {
                "job-1": {"status": "SUCCEEDED"},
                "job-2": {"status": "PENDING"},
            },
        )
        sqs = FakeSqs(send_errors=[RuntimeError("send failed")])

        with pytest.raises(RuntimeError, match="send failed"):
            execute_plan(sqs, "dlq-url", "process-url", plan)

        assert [call[0] for call in sqs.calls] == ["delete", "send", "release"]
        released = sqs.calls[-1][1]["Entries"]
        assert [entry["ReceiptHandle"] for entry in released] == ["receipt-m2"]

    def test_partial_failure_reports_receipts_cleanup_could_not_release(self):
        messages = [
            _message("m1", _splitter()),
            _message("m2", _splitter()),
        ]
        plan = build_recovery_plan(messages, {"job-1": {"status": "PENDING"}})
        sqs = FakeSqs(
            delete_responses=[{
                "Successful": [{"Id": "0"}],
                "Failed": [{"Id": "1"}],
            }],
            release_responses=[{"Failed": [{"Id": "0"}]}],
        )

        with pytest.raises(RuntimeError, match="failed to release 1 unsettled"):
            execute_plan(sqs, "dlq-url", "process-url", plan)
