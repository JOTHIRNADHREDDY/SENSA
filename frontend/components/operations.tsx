"use client";
import { useCallback, useEffect, useState } from "react";
import { api, post } from "./types";
type Status = {
  worker_mode: string;
  queue: { id: string; kind: string; state: string; created: string }[];
  retention: { enabled: boolean; days: number };
  retention_candidates: { id: string; name: string }[];
  quarantined: { asset_id: string }[];
  camera_sources: { id: string; label: string; enabled: boolean }[];
};
export default function OperationsPanel() {
  const [data, setData] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [enabled, setEnabled] = useState(false),
    [days, setDays] = useState(90);
  const load = useCallback(async () => {
    const d = await api<Status>("/operations");
    setData(d);
    setEnabled(d.retention.enabled);
    setDays(d.retention.days);
  }, []);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  return (
    <section className="panel intelligence-panel">
      <span className="eyebrow">WORKSPACE OPERATIONS</span>
      <h2>Durable processing and source retention</h2>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            Worker mode: {data.worker_mode}. Pending work is persisted.
            Interrupted model requests require explicit continuation; they are
            never silently billed again.
          </p>
          <button
            className="button secondary"
            onClick={() => void load().catch((e) => setError(e.message))}
          >
            Refresh operations
          </button>
          <div className="intel-table">
            <table>
              <thead>
                <tr>
                  <th>Work</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.queue.slice(0, 15).map((w) => (
                  <tr key={w.id}>
                    <td>{w.kind}</td>
                    <td>{w.state}</td>
                    <td>{w.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Reversible retention</h3>
          <p>
            Case evidence and report sources are protected. Eligible old
            recordings move to private quarantine and can be restored. Automatic
            permanent deletion is not enabled.
          </p>
          <form
            className="intel-form"
            onSubmit={(e) => {
              e.preventDefault();
              void api("/operations/retention", {
                method: "PUT",
                body: JSON.stringify({ enabled, days }),
              })
                .then(load)
                .catch((e) => setError(e.message));
            }}
          >
            <label className="intel-consent">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Automatically quarantine eligible old recordings
            </label>
            <label>
              Retention days
              <input
                type="number"
                min="1"
                max="3650"
                value={days}
                onChange={(e) => setDays(+e.target.value)}
              />
            </label>
            <button className="button secondary">Save retention policy</button>
          </form>
          <p>
            {data.retention_candidates.length} eligible recordings.{" "}
            {data.quarantined.length} recordings in quarantine.
          </p>
          {data.quarantined.map((q) => (
            <div key={q.asset_id}>
              <span>{q.asset_id}</span>
              <button
                className="button secondary"
                onClick={() =>
                  void api(
                    `/operations/quarantine/${q.asset_id}/restore`,
                    post({}),
                  )
                    .then(load)
                    .catch((e) => setError(e.message))
                }
              >
                Restore recording
              </button>
            </div>
          ))}
          <h3>Live camera sources</h3>
          <p>
            Configured RTSP sources are captured into bounded recording
            segments. Model analysis requires separate authorization. Capture
            receipt time does not verify a camera clock.
          </p>
          {!data.camera_sources.length && (
            <p className="muted">
              No live cameras configured. A server administrator can add private
              connection settings.
            </p>
          )}
          {data.camera_sources.map((c) => (
            <div key={c.id}>
              <strong>{c.label}</strong> · {c.enabled ? "enabled" : "disabled"}
              <button
                className="button secondary"
                disabled={!c.enabled}
                onClick={() =>
                  void api(`/operations/cameras/${c.id}/capture`, post({}))
                    .then(load)
                    .catch((e) => setError(e.message))
                }
              >
                Capture next segment
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
