"use client";
import { useEffect, useState, useCallback } from "react";
import { api, post, type Asset } from "./types";
type Run = {
  id: string;
  status: string;
  options: { mode: string; [key: string]: unknown };
  result: {
    provider_requests?: number;
    warnings?: string[];
    candidates?: {
      asset_id: string;
      start: number;
      end: number;
      score: number;
      reason: string;
      frame_ids: string[];
      source_frames?: {
        frame_id: string;
        source_id: string;
        timestamp: number;
        url: string;
      }[];
    }[];
    report_id?: string;
    coverage?: {
      asset_id: string;
      phase: string;
      status?: string;
      complete: boolean;
      requested_start?: number;
      requested_end?: number;
    }[];
    error?: string;
    coverage_gaps?: {
      asset_id: string;
      start: number;
      end: number;
      status: string;
      reason?: string;
    }[];
  };
};
export default function DiscoveryPanel({
  caseId,
  incident,
  canWrite,
  onChanged,
  onOpen,
}: {
  caseId: string;
  incident: string;
  canWrite: boolean;
  onChanged: () => void;
  onOpen: (id: string, t: number, sourceId?: string) => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [runs, setRuns] = useState<Run[]>([]),
    [text, setText] = useState(incident),
    [mode, setMode] = useState("existing"),
    [consent, setConsent] = useState(false),
    [budget, setBudget] = useState(48),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [a, d] = await Promise.all([
      api<Asset[]>("/videos"),
      api<{ runs: Run[]; asset_ids: string[] }>(`/cases/${caseId}/discovery`),
    ]);
    setAssets(a);
    setRuns(d.runs);
    setSelected((old) => (old.length ? old : d.asset_ids));
  }, [caseId]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  const running = runs.some((r) => ["queued", "running"].includes(r.status));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      void load()
        .then(onChanged)
        .catch((e) => setError(e.message));
    }, 3000);
    return () => clearInterval(id);
  }, [running, load, onChanged]);
  return (
    <section className="panel intelligence-panel">
      <span className="eyebrow">
        DESCRIBE → DISCOVER → RECONSTRUCT → VERIFY
      </span>
      <h2>Discover an incident without a known timestamp</h2>
      <p>
        Select the source collection, describe what is missing, and start a
        bounded discovery run. Coverage, skipped sources and uncertain findings
        remain visible.
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <form
        className="intel-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          void api(
            `/cases/${caseId}/discovery`,
            post({
              incident: text,
              asset_ids: selected,
              mode,
              authorize_external_processing: consent,
              max_requests: budget,
              start_date: from || null,
              end_date: to || null,
              reinspect: true,
              request_key: crypto.randomUUID(),
            }),
          )
            .then(load)
            .then(onChanged)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Describe the incident
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            minLength={10}
            maxLength={3000}
            required
            placeholder="Twenty packages are missing. Find relevant people, object movements and possible incident intervals."
          />
        </label>
        <div className="intel-fields">
          <label>
            From date
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Through date
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            Maximum model requests
            <input
              type="number"
              min={1}
              max={10000}
              value={budget}
              onChange={(e) => setBudget(+e.target.value)}
            />
          </label>
        </div>
        <p className="tiny muted">
          Calendar constraints require independently verified source clocks.
          Month/day text uses the current year when no year is given. Unknown
          source clocks are explicitly excluded from a dated search, never
          treated as matching.
        </p>
        <fieldset>
          <legend>
            Recording scope · raw videos can be selected before events exist
          </legend>
          {assets.map((a) => (
            <label className="intel-consent" key={a.id}>
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                disabled={["queued", "running"].includes(a.status)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, a.id]
                      : selected.filter((id) => id !== a.id),
                  )
                }
              />
              {a.name} · {a.camera} · {a.duration.toFixed(1)}s{" "}
              {a.synthetic ? " · SYNTHETIC" : ""} · {a.status}
            </label>
          ))}
        </fieldset>
        <label>
          Discovery mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="existing">
              Review existing indexed evidence · no new model calls
            </option>
            <option value="meta">
              Discover across source footage with SAM + Spark and automatic
              reinspection
            </option>
          </select>
        </label>
        {mode === "meta" && (
          <label className="intel-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Authorize the selected source evidence to Meta Standard within the
            request ceiling, including candidate reinspection. Provider charges
            apply. SAM may bill at least 50 frames/request.
          </label>
        )}
        <button
          className="button primary"
          disabled={
            !canWrite ||
            busy ||
            running ||
            !selected.length ||
            (mode === "meta" && !consent)
          }
        >
          Start Describe → Discover
        </button>
      </form>
      {runs.slice(0, 1).map((r) => (
        <article key={r.id} className="intel-finding">
          <b>
            Discovery {r.status} · {r.result.provider_requests ?? 0} new
            provider requests
          </b>
          {r.result.error && <p className="inline-error">{r.result.error}</p>}
          {["partial", "interrupted", "failed"].includes(r.status) && (
            <button
              className="button secondary"
              disabled={
                !canWrite ||
                busy ||
                running ||
                (r.options.mode === "meta" && !(mode === "meta" && consent))
              }
              onClick={() => {
                setBusy(true);
                setError("");
                void api(
                  `/cases/${caseId}/discovery`,
                  post({
                    ...r.options,
                    max_requests: budget,
                    authorize_external_processing: consent,
                    resume_from: r.id,
                    request_key: crypto.randomUUID(),
                  }),
                )
                  .then(load)
                  .then(onChanged)
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Continue remaining coverage in this run&apos;s original scope
            </button>
          )}
          {r.result.warnings?.map((w, i) => (
            <p key={i} className="small">
              {w}
            </p>
          ))}
          {["queued", "running"].includes(r.status) && (
            <button
              className="button secondary"
              onClick={() =>
                void api(`/discovery/${r.id}/cancel`, post({})).then(load)
              }
            >
              Cancel remaining work
            </button>
          )}
          <div className="intel-refs">
            {r.result.report_id && (
              <>
                <a
                  href={`/api/reports/${r.result.report_id}/portable/summary`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download portable summary
                </a>
                <a href={`/api/reports/${r.result.report_id}/portable/json`}>
                  Download JSON
                </a>
              </>
            )}
          </div>
          <h3>Ranked evidence leads · not confirmed wrongdoing</h3>
          {r.result.candidates?.slice(0, 12).map((c, i) => (
            <div key={i}>
              <button
                className="inline-citation"
                disabled={!c.source_frames?.length}
                onClick={() =>
                  onOpen(c.asset_id, c.start, c.source_frames?.[0].source_id)
                }
              >
                {c.start.toFixed(3)}–{c.end.toFixed(3)}s · {c.reason} · rank{" "}
                {c.score}
              </button>
              <div className="intel-refs">
                {c.source_frames?.slice(0, 3).map((f) => (
                  <a
                    key={f.frame_id}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Native frame {f.timestamp.toFixed(3)}s ↗
                  </a>
                ))}
                {!c.source_frames?.length && (
                  <span>
                    Use the episode graph to review source-bound evidence.
                  </span>
                )}
              </div>
            </div>
          ))}
          <details>
            <summary>
              Coverage ledger · sampled, not exhaustive per-frame verification
            </summary>
            <pre>{JSON.stringify(r.result.coverage || [], null, 2)}</pre>
            {r.result.coverage_gaps?.map((gap) => (
              <p key={`${gap.asset_id}:${gap.start}:${gap.end}`}>
                {assets.find((asset) => asset.id === gap.asset_id)?.name ??
                  "Recording"}{" "}
                · {gap.start.toFixed(3)}–{gap.end.toFixed(3)}s · {gap.status}
                {gap.reason ? ` · ${gap.reason}` : ""}
              </p>
            ))}
          </details>
        </article>
      ))}
      {runs.length > 1 && (
        <details>
          <summary>
            Previous discovery runs · {runs.length - 1} preserved snapshots
          </summary>
          {runs.slice(1).map((r) => (
            <article className="intel-finding" key={r.id}>
              <strong>Previous run · {r.status}</strong>
              <p className="small muted">
                This saved run is preserved for comparison with the current
                evidence.
              </p>
              {r.result.report_id && (
                <div className="intel-refs">
                  <a
                    href={`/api/reports/${r.result.report_id}/portable/summary`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Previous portable summary
                  </a>
                  <a href={`/api/reports/${r.result.report_id}/portable/json`}>
                    Previous report JSON
                  </a>
                </div>
              )}
              <details>
                <summary>Previous coverage and findings</summary>
                <pre>{JSON.stringify(r.result, null, 2)}</pre>
              </details>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
