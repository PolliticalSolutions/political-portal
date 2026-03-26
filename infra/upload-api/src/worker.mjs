/**
 * Upload processor worker — stub only.
 *
 * Real processing is performed by the local listener at scripts/listener/listener.py.
 * The WorkerProcessQueueMapping event source mapping is disabled, so this Lambda is
 * not triggered by the SQS ProcessQueue. This stub exists as a safety net: if the
 * mapping is accidentally re-enabled it will ACK messages without touching any jobs.
 */

function logEvent(stage, data = {}) {
  console.log(JSON.stringify({ stage, ts: new Date().toISOString(), ...data }));
}

export async function handler(event) {
  const records = event.Records || [];
  logEvent("worker_stub_invoked", {
    message:
      "Worker stub — processing is handled by the local listener. No action taken.",
    recordCount: records.length,
  });
  return { batchItemFailures: [] };
}
