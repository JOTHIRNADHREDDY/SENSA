"use client";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  post,
  type AssetDetail,
  type PinnedPlayback,
  type Run,
} from "./types";

type FrameRef = {
  id: string;
  timestamp: number;
  source_frame_index: number;
  source_pts: number;
  segment: number;
  camera_timestamp: string | null;
  segment_relative_timestamp: number;
};
type Track = {
  id: string;
  category: string;
  first: number;
  last: number;
  frame_ids: string[];
  observations: string[];
  association_scores: (number | null)[];
  state: string;
  visibility_state?: string;
  states: { timestamp: number; state: string; visibility: string[] }[];
  first_box: number[];
  last_box: number[];
};
type Finding = {
  id: string;
  kind: string;
  state: string;
  person_track: string | null;
  object_track: string | null;
  start: number;
  end: number;
  frame_ids: string[];
  uncertainty: string;
};
type Plan = {
  start: number;
  end: number;
  fps: number;
  reasons: string[];
  state: string;
};
type Config = {
  camera_id: string;
  clock_start: string | null;
  clock_verified: boolean;
  clock_evidence: string;
  zones: { name: string; box: number[] }[];
};
type Snapshot = {
  id: string;
  created: string;
  data: {
    source: {
      id: string;
      sha256: string;
      relationship: string;
      metadata_json: Record<string, unknown>;
    };
    camera_namespace: string;
    clock: { start: string | null; verified: boolean };
    summary: {
      tracklets: number;
      object_tracks: number;
      minimum_co_visible_people: number;
      unique_people: null;
      reviewed_frames: number;
      unresolved_findings: number;
    };
    object_comparisons?: {
      object_track: string;
      appearance_difference: number;
      interpretation: string;
      uncertainty: string;
    }[];
    tracks: Track[];
    findings: Finding[];
    contradictions: {
      id: string;
      description: string;
      timestamp: number;
      frame_ids: string[];
    }[];
    person_hypotheses: {
      from_track: string;
      to_track: string;
      state: string;
      reason: string;
    }[];
    reinspection_plan: Plan[];
    frames: FrameRef[];
    continuity: {
      decoded_frames: number;
      duplicate_count: number;
      changes: {
        index: number;
        timestamp: number;
        kind: string;
        cause: string;
      }[];
      pts_gaps: unknown[];
    };
    limitations: string[];
    time_policy: string;
  };
};
type Job = {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  cancel_requested: boolean;
  result: {
    provider_requests?: number;
    cache_hits?: number;
    uncertainty_resolved?: boolean;
    resolution_note?: string;
    elapsed_ms?: number;
    budget_exhausted?: boolean;
  };
  options: { mode: string };
};
type IntelResponse = {
  playback: PinnedPlayback;
  snapshot: Snapshot | null;
  jobs: Job[];
  configuration: Config;
  concepts: string[];
  detection_confidence_policy: string;
};
const ts = (n: number) => `${n.toFixed(3)}s`;
const pretty = (s: string) => s.replaceAll("_", " ");

export function IntelligencePanel({
  assetId,
  canWrite,
  onSeek,
  onChanged,
}: {
  assetId: string;
  canWrite: boolean;
  onSeek: (time: number) => void;
  onChanged: () => void;
}) {
  const [intel, setIntel] = useState<IntelResponse | null>(null);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [tab, setTab] = useState("Tracks");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [concepts, setConcepts] = useState([
    "person",
    "cardboard box",
    "shelf",
  ]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [budget, setBudget] = useState(8);
  const [selected, setSelected] = useState("");
  const [configured, setConfigured] = useState(false);
  const load = useCallback(async () => {
    const [i, d] = await Promise.all([
      api<IntelResponse>(`/videos/${assetId}/intelligence`),
      api<AssetDetail>(`/videos/${assetId}`),
    ]);
    setIntel(i);
    setDetail(d);
  }, [assetId]);
  useEffect(() => {
    let live = true;
    void load().catch((e) => {
      if (live) setError(String(e.message));
    });
    return () => {
      live = false;
    };
  }, [load]);
  const pending =
    intel?.jobs.some((j) => ["running", "queued"].includes(j.status)) ?? false;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      void load()
        .then(onChanged)
        .catch((e) => setError(e.message));
    }, 2500);
    return () => clearInterval(timer);
  }, [pending, load, onChanged]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(mode: "local" | "meta") {
    await action(() =>
      api(
        `/videos/${assetId}/intelligence/jobs`,
        post({
          mode,
          request_key: crypto.randomUUID(),
          authorize_external_processing: mode === "meta" && authorized,
          concepts,
          start: start === "" ? null : +start,
          end: end === "" ? null : +end,
          fps: 5,
          max_windows: 2,
          max_requests: budget,
        }),
      ),
    );
  }
  const d = intel?.snapshot?.data;
  const sourceFrames =
    d?.source.id === intel?.playback.source_id
      ? intel?.playback.frames
      : undefined;
  function frameButton(id: string) {
    const f = d?.frames.find((f) => f.id === id);
    return (
      <span className="intel-ref" key={id}>
        <button onClick={() => f && onSeek(f.timestamp)}>
          {f ? ts(f.timestamp) : id.slice(0, 8)}
        </button>
        {sourceFrames?.[id] ? (
          <a href={sourceFrames[id].url} target="_blank" rel="noreferrer">
            Native PNG ↗
          </a>
        ) : (
          <span>Native frame binding unavailable</span>
        )}
      </span>
    );
  }
  const track = d?.tracks.find((t) => t.id === selected);
  return (
    <section className="panel intelligence-panel">
      <div className="intel-heading">
        <div>
          <span className="eyebrow">CONNECTED EVIDENCE</span>
          <h2>Visual investigation</h2>
          <p className="small muted">
            Cut-safe anonymous tracklets, object evidence and targeted
            inspection.
          </p>
        </div>
        {canWrite && (
          <button
            className="button secondary"
            disabled={busy || pending}
            onClick={() => void inspect("local")}
          >
            {busy ? "Working…" : "Refresh intelligence · local"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {pending && (
        <p className="notice-box">
          Processing bounded evidence. Existing observations and report
          snapshots are preserved.
        </p>
      )}
      {!d ? (
        <p className="notice-box">
          Build local intelligence from the existing stored frames and
          detections. This scan calls no external model.
        </p>
      ) : (
        <>
          <div className="intel-stats">
            <div>
              <b>{d.summary.minimum_co_visible_people}</b>
              <span>max co-visible detections</span>
            </div>
            <div>
              <b>{d.summary.tracklets}</b>
              <span>person tracklets</span>
            </div>
            <div>
              <b>Unknown</b>
              <span>distinct people</span>
            </div>
            <div>
              <b>{d.summary.object_tracks}</b>
              <span>object tracks</span>
            </div>
            <div>
              <b>{d.continuity.changes.length}</b>
              <span>continuity changes</span>
            </div>
          </div>
          <p className="tiny muted">
            Tracklets are fragments of visual evidence, never a count of
            distinct people. {d.time_policy}
          </p>
        </>
      )}
      <div className="tabs intel-tabs">
        {[
          "Tracks",
          "Objects",
          "Continuity",
          "Reinspection",
          "Camera & zones",
          "Provenance",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "selected" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Tracks" && (
        <>
          <div className="intel-split">
            <div className="intel-list">
              {d?.tracks
                .filter((t) => t.category === "person")
                .map((t) => (
                  <button
                    className={`intel-track ${selected === t.id ? "selected" : ""}`}
                    key={t.id}
                    onClick={() => {
                      setSelected(t.id);
                      onSeek(t.first);
                    }}
                  >
                    <b>{t.id}</b>
                    <span>
                      {ts(t.first)}–{ts(t.last)} · {t.observations.length}{" "}
                      detections
                    </span>
                    <small>{pretty(t.state)}</small>
                  </button>
                ))}
            </div>
            <div>
              {track ? (
                <>
                  <h3>{track.id}</h3>
                  <p>
                    {track.category} · {track.observations.length} supported
                    detections
                  </p>
                  <p>
                    Association scores are uncalibrated geometry heuristics.
                    Detection confidence stays unknown unless reported by SAM.
                  </p>
                  <p>
                    {pretty(track.state)}. First/last visibility is not premises
                    entry or exit.
                  </p>
                  <div className="intel-refs">
                    {track.frame_ids.map(frameButton)}
                  </div>
                  <details>
                    <summary>Association and visibility states</summary>
                    <pre>{JSON.stringify(track.states, null, 2)}</pre>
                  </details>
                </>
              ) : (
                <p className="muted">
                  Select a tracklet to inspect its source frames and association
                  states.
                </p>
              )}
            </div>
          </div>
          {!!d?.person_hypotheses.length && (
            <details>
              <summary>
                {d.person_hypotheses.length} uncertain track associations · not
                merged
              </summary>
              {d.person_hypotheses.map((h, n) => (
                <p key={n}>
                  <b>
                    {h.from_track} → {h.to_track}
                  </b>
                  <br />
                  {h.reason}
                </p>
              ))}
            </details>
          )}
        </>
      )}
      {tab === "Objects" && (
        <>
          <p className="small muted">
            A SAM concept match is localization evidence. Clothing/glare can be
            mislocalized; movement is a hypothesis until the object boundary and
            continuity are verified.
          </p>
          {!d?.tracks.some((t) => t.category !== "person") && (
            <p>
              No object grounding is stored for this analysis. Choose bounded
              object prompts in Reinspection.
            </p>
          )}
          {d?.tracks
            .filter((t) => t.category !== "person")
            .map((t) => (
              <details key={t.id}>
                <summary>
                  {t.category} · {t.id} · {t.observations.length} detections
                </summary>
                <p>
                  {ts(t.first)}–{ts(t.last)}.{" "}
                  {pretty(t.visibility_state || "unresolved")}
                </p>
                <p className="tiny">
                  Before: {t.first_box.map((n) => n.toFixed(3)).join(", ")} /
                  After: {t.last_box.map((n) => n.toFixed(3)).join(", ")}
                </p>
                <div className="intel-refs">{t.frame_ids.map(frameButton)}</div>
              </details>
            ))}
          <h3>Before / after object comparisons</h3>
          {d?.object_comparisons?.map((c) => (
            <p key={c.object_track}>
              <b>{c.object_track}</b>: {c.interpretation} (difference score{" "}
              {c.appearance_difference.toFixed(3)}). {c.uncertainty}
            </p>
          ))}
          <h3>Person–object findings</h3>
          {!d?.findings.length && (
            <p>
              No supported interaction or movement finding is stored. Proximity,
              hand movement and missing detections do not establish contact or
              removal.
            </p>
          )}
          {d?.findings.map((f) => (
            <article className="intel-finding" key={f.id}>
              <b>
                {pretty(f.kind)} · {f.state}
              </b>
              <p>
                {ts(f.start)}–{ts(f.end)} /{" "}
                {f.person_track || "No person assigned"} /{" "}
                {f.object_track || "No object assigned"}
              </p>
              <p>{f.uncertainty}</p>
              <div className="intel-refs">
                {f.frame_ids.slice(0, 8).map(frameButton)}
              </div>
            </article>
          ))}
        </>
      )}
      {tab === "Continuity" && (
        <>
          <p>
            {d?.continuity.decoded_frames ?? "—"} decoded frames scanned.{" "}
            {d?.continuity.duplicate_count ?? "—"} duplicate/repeated image
            positions. Repeated pixels may show a static scene; they do not
            establish replay.
          </p>
          {d?.continuity.changes.map((c) => (
            <button
              className="intel-track"
              key={c.index}
              onClick={() => onSeek(c.timestamp)}
            >
              <b>
                {ts(c.timestamp)} · source frame {c.index}
              </b>
              <span>
                {pretty(c.kind)}. {c.cause}
              </span>
            </button>
          ))}
          <p className="small muted">
            Tracks are split at continuity changes. Seeking, missing CCTV time
            and a camera switch remain possible causes, not verified facts.
          </p>
          <details>
            <summary>
              Decoded / playback / camera / segment timestamp ledger
            </summary>
            <div className="intel-table">
              <table>
                <thead>
                  <tr>
                    <th>Frame</th>
                    <th>Source PTS</th>
                    <th>Segment / relative</th>
                    <th>Camera clock</th>
                  </tr>
                </thead>
                <tbody>
                  {d?.frames.map((f) => (
                    <tr key={f.id}>
                      <td>
                        {sourceFrames?.[f.id] ? (
                          <a
                            href={sourceFrames[f.id].url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {f.source_frame_index}
                          </a>
                        ) : (
                          f.source_frame_index
                        )}
                      </td>
                      <td>{ts(f.source_pts)}</td>
                      <td>
                        S{f.segment} / {ts(f.segment_relative_timestamp)}
                      </td>
                      <td>{f.camera_timestamp || "Unverified"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {tab === "Reinspection" && (
        <>
          <p>
            Automatic proposals target overlaps, cropped people, track
            fragments, contradictions and continuity changes. A bounded Meta job
            extracts original frames at up to 5fps, splits at cuts and appends
            new results.
          </p>
          {d?.reinspection_plan.map((w, n) => (
            <button
              className="intel-track"
              key={n}
              onClick={() => {
                setStart(w.start.toFixed(3));
                setEnd(w.end.toFixed(3));
                onSeek(w.start);
              }}
            >
              <b>
                {ts(w.start)}–{ts(w.end)} · {w.fps}fps
              </b>
              <span>
                {w.reasons.map(pretty).join(", ")} · uncertainty unresolved
              </span>
            </button>
          ))}
          {canWrite && (
            <div className="intel-form">
              <div className="intel-fields">
                <label>
                  Start playback seconds
                  <input
                    type="number"
                    min="0"
                    max={detail?.duration}
                    step=".001"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    placeholder="Automatic proposals"
                  />
                </label>
                <label>
                  End playback seconds
                  <input
                    type="number"
                    min="0"
                    max={detail?.duration}
                    step=".001"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    placeholder="Maximum 12s window"
                  />
                </label>
                <label>
                  Request ceiling
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={budget}
                    onChange={(e) => setBudget(+e.target.value)}
                  />
                </label>
              </div>
              <fieldset>
                <legend>Visual grounding concepts · at most four</legend>
                <div className="intel-concepts">
                  {intel?.concepts.map((c) => (
                    <label key={c}>
                      <input
                        type="checkbox"
                        checked={concepts.includes(c)}
                        onChange={(e) =>
                          setConcepts(
                            e.target.checked
                              ? [...concepts, c]
                              : concepts.filter((x) => x !== c),
                          )
                        }
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="tiny muted">
                Blank times use up to two automatic proposals. Each request uses
                at most 12 source frames; total inference calls stay within the
                ceiling. SAM may bill a minimum of 50 frames per call.
                Failed/interrupted usage can be unknown. No automatic billed
                retry.
              </p>
              <label className="intel-consent">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                />
                Authorize sending this bounded evidence to Meta Standard for
                analysis; provider charges may apply.
              </label>
              <button
                className="button primary"
                disabled={
                  !authorized ||
                  busy ||
                  pending ||
                  !concepts.length ||
                  concepts.length > 4
                }
                onClick={() => void inspect("meta")}
              >
                Inspect selected evidence with Meta
              </button>
            </div>
          )}
          <h3>Inspection jobs</h3>
          {!intel?.jobs.length && <p>No targeted inspection jobs yet.</p>}
          {intel?.jobs.map((j) => (
            <article className="intel-finding" key={j.id}>
              <b>
                {j.options.mode} · {j.status}
                {j.cancel_requested ? " · cancellation requested" : ""}
              </b>
              <p>
                {j.progress}% · {j.result.provider_requests ?? "Unknown"}{" "}
                provider requests · {j.result.cache_hits ?? 0} cache hits
              </p>
              {j.error && <p className="inline-error">{j.error}</p>}
              <p className="small muted">{j.result.resolution_note}</p>
              {canWrite && ["queued", "running"].includes(j.status) && (
                <button
                  className="button secondary"
                  onClick={() =>
                    void action(() =>
                      api(`/intelligence/jobs/${j.id}/cancel`, post({})),
                    )
                  }
                >
                  Cancel remaining work
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {tab === "Camera & zones" && intel && detail && (
        <form
          className="intel-form"
          key={intel.configuration.camera_id}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(async () => {
              await api(`/videos/${assetId}/configuration`, {
                method: "PATCH",
                body: JSON.stringify({
                  label: f.get("label"),
                  camera_id: f.get("camera_id") || null,
                  clock_start: f.get("clock_start") || null,
                  clock_verified: f.get("clock_verified") === "on",
                  clock_evidence: f.get("clock_evidence"),
                  zones: JSON.parse(String(f.get("zones"))),
                }),
              });
              setConfigured(true);
            });
          }}
        >
          <p className="small muted">
            Camera identity is a configured source label. Reuse a camera ID only
            for recordings independently known to come from that camera. This
            does not join person tracks.
          </p>
          <label>
            Camera label
            <input
              name="label"
              required
              maxLength={80}
              defaultValue={detail.camera}
              disabled={!canWrite}
            />
          </label>
          <label>
            Camera ID
            <input
              name="camera_id"
              defaultValue={intel.configuration.camera_id}
              disabled={!canWrite}
            />
          </label>
          <label>
            Verified recording-start clock · ISO timestamp with UTC offset
            <input
              name="clock_start"
              placeholder="2026-11-01T01:00:00+05:30"
              defaultValue={intel.configuration.clock_start || ""}
              disabled={!canWrite}
            />
          </label>
          <label className="intel-consent">
            <input
              name="clock_verified"
              type="checkbox"
              defaultChecked={intel.configuration.clock_verified}
              disabled={!canWrite}
            />
            Source clock is independently verified
          </label>
          <label>
            Clock verification evidence
            <textarea
              name="clock_evidence"
              maxLength={1000}
              defaultValue={intel.configuration.clock_evidence}
              disabled={!canWrite}
            />
          </label>
          <label>
            Camera zones · JSON with normalized [left, top, right, bottom] boxes
            <textarea
              name="zones"
              rows={5}
              defaultValue={JSON.stringify(intel.configuration.zones, null, 2)}
              disabled={!canWrite}
            />
          </label>
          <p className="tiny muted">
            Example: [{`{"name":"Rear entrance zone","box":[0.1,0.1,0.4,0.9]}`}]
            . Zone crossings describe image geometry, not a verified premises
            entry/exit.
          </p>
          {canWrite && (
            <button className="button primary" disabled={busy}>
              Save camera configuration
            </button>
          )}
          {configured && (
            <p>Saved. Refresh local intelligence to apply the configuration.</p>
          )}
        </form>
      )}
      {tab === "Provenance" && (
        <>
          <p>{intel?.detection_confidence_policy}</p>
          {d && (
            <>
              <p>Selected source: {pretty(d.source.relationship)}</p>
              <code className="hash">{d.source.sha256}</code>
              <pre>{JSON.stringify(d.source.metadata_json, null, 2)}</pre>
              <ul>
                {d.limitations.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
          <div className="intel-table">
            <table>
              <thead>
                <tr>
                  <th>Model / provenance</th>
                  <th>Completion</th>
                  <th>Actual provider usage</th>
                </tr>
              </thead>
              <tbody>
                {detail?.runs.map((r: Run) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.model}</b>
                      <br />
                      {r.provider}
                      <small>{r.routing}</small>
                    </td>
                    <td>
                      {r.status}
                      <br />
                      {r.elapsed_ms}ms
                    </td>
                    <td>
                      <code>{JSON.stringify(r.usage)}</code>
                      {!Object.keys(r.usage).length && (
                        <p>
                          Usage unknown / not reported. Do not infer zero cost.
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

type Node = {
  id: string;
  kind: string;
  label: string;
  data: Record<string, unknown>;
};
type Graph = {
  nodes: Node[];
  edges: { source: string; target: string; relationship: string }[];
  time_policy: string;
};
type SearchRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  start: number;
  end: number;
  asset_id: string;
  source_frames: {
    frame_id: string;
    asset_id: string;
    source_id?: string;
    timestamp: number;
    url: string;
  }[];
};
export function CaseIntelligence({
  caseId,
  canWrite,
  onOpen,
}: {
  caseId: string;
  canWrite: boolean;
  onOpen: (asset: string, time: number, sourceId?: string) => void;
}) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [focus, setFocus] = useState("");
  const [filter, setFilter] = useState("interaction");
  const [query, setQuery] = useState("Show all unresolved interactions");
  const [result, setResult] = useState<{
    items: SearchRow[];
    notice: string;
    filters: Record<string, unknown>;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const g = await api<Graph>(`/cases/${caseId}/graph`);
    setGraph(g);
    setFocus(
      g.nodes.find((n) => n.kind === "interaction")?.id || g.nodes[0]?.id || "",
    );
  }, [caseId]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  const selected = graph?.nodes.find((n) => n.id === focus);
  const related =
    graph?.edges
      .filter((e) => e.source === focus || e.target === focus)
      .slice(0, 20) || [];
  const neighbors = [
    ...new Set(related.map((e) => (e.source === focus ? e.target : e.source))),
  ]
    .map((id) => graph?.nodes.find((n) => n.id === id))
    .filter(Boolean) as Node[];
  const kinds = [...new Set(graph?.nodes.map((n) => n.kind) || [])];
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel intelligence-panel">
      <span className="eyebrow">INVESTIGATION INTELLIGENCE</span>
      <h2>Search connected evidence</h2>
      <p className="muted">
        Stored person, object, frame, event, model and review records. No
        invented references or real identities.
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {notice && <p className="notice-box">{notice}</p>}
      <div className="intel-stats">
        <div>
          <b>{graph?.nodes.filter((n) => n.kind === "video").length ?? "—"}</b>
          <span>linked recordings</span>
        </div>
        <div>
          <b>
            {graph?.nodes.filter((n) => n.kind === "person_tracklet").length ??
              "—"}
          </b>
          <span>tracklets · not people</span>
        </div>
        <div>
          <b>
            {graph?.nodes.filter((n) => n.kind === "contradiction").length ??
              "—"}
          </b>
          <span>contradictions</span>
        </div>
        <div>
          <b>
            {graph?.nodes.filter((n) => n.kind === "human_review").length ??
              "—"}
          </b>
          <span>recorded human reviews</span>
        </div>
      </div>
      <form
        className="intel-search"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () =>
            setResult(
              await api(
                `/cases/${caseId}/search?q=${encodeURIComponent(query)}`,
              ),
            ),
          );
        }}
      >
        <input
          aria-label="Search investigation evidence"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          minLength={3}
          maxLength={500}
          required
        />
        <button className="button primary" disabled={busy}>
          Search evidence
        </button>
      </form>
      <div className="intel-refs">
        {[
          "Find people interacting with storage shelves",
          "Show all possible package movement events",
          "Show people carrying boxes",
          "Which findings have conflicting model interpretations?",
          "What happened between 1 AM and 3 AM?",
        ].map((q) => (
          <button key={q} onClick={() => setQuery(q)}>
            {q}
          </button>
        ))}
      </div>
      {result && (
        <>
          <p className="notice-box">
            {result.notice} {String(result.filters.reason || "")}
          </p>
          {result.items.map((r) => {
            const frames = r.source_frames.filter((f) => !!f.source_id);
            const first = frames[0];
            return (
              <article className="intel-finding" key={r.id}>
                <button
                  className="inline-citation"
                  disabled={!first}
                  onClick={() =>
                    first &&
                    onOpen(first.asset_id, first.timestamp, first.source_id)
                  }
                >
                  {ts(r.start)}–{ts(r.end)} · {r.category}
                </button>
                <h3>{r.title}</h3>
                <p>{r.description}</p>
                <div className="intel-refs">
                  {!first && (
                    <span>
                      Evidence unavailable. Source binding could not be
                      verified.
                    </span>
                  )}
                  {frames.slice(0, 6).map((f) => (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      key={f.frame_id}
                    >
                      Native frame {ts(f.timestamp)} ↗
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </>
      )}
      <h3>Evidence relationship explorer</h3>
      <div className="intel-split">
        <div>
          <label>
            Entity type
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <div className="intel-list">
            {graph?.nodes
              .filter((n) => n.kind === filter)
              .map((n) => (
                <button
                  key={n.id}
                  className={`intel-track ${focus === n.id ? "selected" : ""}`}
                  onClick={() => setFocus(n.id)}
                >
                  <b>{n.label}</b>
                  <small>{n.id}</small>
                </button>
              ))}
          </div>
        </div>
        <div>
          <svg
            viewBox="0 0 640 420"
            className="evidence-graph"
            role="img"
            aria-label="Selected evidence relationships"
          >
            {neighbors.map((n, i) => {
              const a = (2 * Math.PI * i) / Math.max(1, neighbors.length);
              const x = 320 + Math.cos(a) * 235;
              const y = 210 + Math.sin(a) * 155;
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFocus(n.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setFocus(n.id);
                  }}
                >
                  <line x1="320" y1="210" x2={x} y2={y} stroke="var(--muted)" />
                  <circle cx={x} cy={y} r="12" fill="var(--evidence)" />
                  <text x={x} y={y + 27} textAnchor="middle" fontSize="10">
                    {n.kind.replaceAll("_", " ")}
                  </text>
                </g>
              );
            })}
            <circle cx="320" cy="210" r="37" fill="var(--hover)" />
            <text
              x="320"
              y="214"
              textAnchor="middle"
              fill="var(--text)"
              fontSize="10"
            >
              {selected?.kind || "Select evidence"}
            </text>
          </svg>
          {selected && (
            <>
              <b>{selected.label}</b>
              <p className="tiny muted">{selected.id}</p>
              {selected.kind === "frame" && !selected.data.source_id && (
                <p>
                  Evidence unavailable. Source binding could not be verified.
                </p>
              )}
              {selected.kind === "frame" && !!selected.data.source_id && (
                <>
                  <a
                    className="button secondary"
                    href={String(selected.data.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open native frame
                  </a>
                  <button
                    className="button secondary"
                    onClick={() =>
                      onOpen(
                        String(selected.data.asset_id),
                        Number(selected.data.timestamp),
                        String(selected.data.source_id),
                      )
                    }
                  >
                    Open video at frame
                  </button>
                </>
              )}
              {canWrite &&
                [
                  "finding",
                  "interaction",
                  "contradiction",
                  "person_hypothesis",
                ].includes(selected.kind) && (
                  <form
                    className="intel-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action(async () => {
                        await api(
                          `/cases/${caseId}/finding-reviews`,
                          post({
                            reference: selected.id,
                            disposition: f.get("disposition"),
                            notes: f.get("notes"),
                          }),
                        );
                        setNotice(
                          "Attributed finding review saved. This does not verify identity or guilt.",
                        );
                        await load();
                      });
                    }}
                  >
                    <label>
                      Finding review
                      <select name="disposition">
                        <option value="unresolved">Unresolved</option>
                        <option value="supported">
                          Supported by reviewed evidence
                        </option>
                        <option value="rejected">
                          Rejected interpretation
                        </option>
                      </select>
                    </label>
                    <label>
                      Verification evidence / reason
                      <textarea name="notes" minLength={10} required />
                    </label>
                    <button className="button secondary" disabled={busy}>
                      Save human finding review
                    </button>
                  </form>
                )}
              <details>
                <summary>Source, geometry and processing provenance</summary>
                <pre>{JSON.stringify(selected.data, null, 2)}</pre>
              </details>
              <div className="intel-list">
                {related.map((e, n) => (
                  <button
                    className="intel-track"
                    key={n}
                    onClick={() =>
                      setFocus(e.source === focus ? e.target : e.source)
                    }
                  >
                    {pretty(e.relationship)} →{" "}
                    {
                      graph?.nodes.find(
                        (node) =>
                          node.id ===
                          (e.source === focus ? e.target : e.source),
                      )?.label
                    }
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <p className="tiny muted">
        Showing at most 20 immediate relationships. {graph?.time_policy}
      </p>
      {canWrite && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const r = await api<{ added: number }>(
                `/cases/${caseId}/intelligence/attach`,
                post({}),
              );
              setNotice(
                `${r.added} stored intelligence events attached. Generate a new report snapshot to include the updated scope.`,
              );
              await load();
            })
          }
        >
          Attach supported intelligence events to timeline
        </button>
      )}
      <details>
        <summary>Record a cross-camera evidence association</summary>
        <p>
          Use existing frame references from distinct configured cameras.
          Verified spatiotemporal associations require a reviewer, verified
          source clocks and supporting notes. Person tracks remain separate and
          identity stays unverified.
        </p>
        <form
          className="intel-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(async () => {
              await api(
                `/cases/${caseId}/camera-associations`,
                post({
                  from_reference: f.get("from_reference"),
                  to_reference: f.get("to_reference"),
                  state: f.get("state"),
                  evidence_notes: f.get("evidence_notes"),
                }),
              );
              setNotice(
                "Cross-camera association recorded with provenance. No tracks merged and no real identity verified.",
              );
              await load();
            });
          }}
        >
          <label>
            Earlier source frame
            <select name="from_reference" required>
              {graph?.nodes
                .filter((n) => n.kind === "frame")
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data.asset_id as string} · {n.label} · {n.id.slice(-8)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Later source frame
            <select name="to_reference" required>
              {graph?.nodes
                .filter((n) => n.kind === "frame")
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data.asset_id as string} · {n.label} · {n.id.slice(-8)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Review state
            <select name="state">
              <option value="unverified">Unverified hypothesis</option>
              <option value="human_verified_spatiotemporal">
                Human-verified time/spatial evidence
              </option>
            </select>
          </label>
          <label>
            Evidence notes
            <textarea
              name="evidence_notes"
              required
              minLength={10}
              maxLength={2000}
            />
          </label>
          <button className="button primary" disabled={!canWrite || busy}>
            Record association
          </button>
        </form>
      </details>
      <details>
        <summary>
          Import optional inventory, access or incident evidence
        </summary>
        <p>
          Import structured JSON rows with record IDs, timestamp with UTC offset
          and optional video_reference from this graph. Correlation requires
          verified identifiers and synchronized source clocks. A temporal lead
          is not proof of causation or theft.
        </p>
        <form
          className="intel-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(async () => {
              const r = await api<{ rows: { correlation_status: string }[] }>(
                `/cases/${caseId}/enrichment`,
                post({
                  kind: f.get("kind"),
                  rows: JSON.parse(String(f.get("rows"))),
                  clock_verified: f.get("clock_verified") === "on",
                  verified_identifiers: f.get("verified_identifiers") === "on",
                }),
              );
              setNotice(r.rows.map((x) => x.correlation_status).join("; "));
              await load();
            });
          }}
        >
          <label>
            Evidence category
            <select name="kind">
              {[
                "inventory",
                "goods_receipt",
                "dispatch",
                "stock_adjustment",
                "access_log",
                "incident_note",
                "human_testimony",
              ].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            JSON records
            <textarea name="rows" rows={6} required defaultValue="[]" />
          </label>
          <label className="intel-consent">
            <input type="checkbox" name="verified_identifiers" />
            Identifiers independently verified
          </label>
          <label className="intel-consent">
            <input type="checkbox" name="clock_verified" />
            Imported source clock independently verified
          </label>
          <button className="button primary" disabled={!canWrite || busy}>
            Import private evidence
          </button>
        </form>
      </details>
    </section>
  );
}
