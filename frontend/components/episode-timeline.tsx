"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { api } from "./types";
const pretty = (s: string) => s.replaceAll("_", " ");
const ts = (n: number) => `${n.toFixed(3)}s`;

type Episode = {
  id: string;
  asset_id: string;
  source_id: string;
  kind: string;
  start: number;
  end: number;
  camera_start: string | null;
  clock_status: string;
  state: string;
  sample_count: number;
  support_record_count: number;
  frame_ids: string[];
  source_event_ids: string[];
  person_track: string | null;
  object_track: string | null;
  source_sha256: string;
  uncertainty: string;
};
type Node = {
  id: string;
  kind: string;
  label: string;
  data: Record<string, unknown>;
};
type Edge = { source: string; target: string; relationship: string };
type Result = {
  items: Episode[];
  total: number;
  chronology: string;
  chronology_description: string;
  recordings: { id: string; name: string }[];
  graph: { nodes: Node[]; edges: Edge[] };
};

export default function EpisodeTimeline({
  caseId,
  onOpen,
}: {
  caseId: string;
  onOpen: (assetId: string, time: number, sourceId?: string) => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [offset, setOffset] = useState(0);
  const [focus, setFocus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const generation = ++request.current;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: query,
        offset: String(offset),
        limit: "25",
      });
      if (recording) params.set("asset_id", recording);
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      const value = await api<Result>(`/cases/${caseId}/timeline?${params}`);
      if (generation !== request.current) return;
      setResult(value);
      setFocus(value.items[0]?.id || "");
    } catch (e) {
      if (generation === request.current) setError((e as Error).message);
    } finally {
      if (generation === request.current) setBusy(false);
    }
  }, [caseId, query, recording, start, end, offset]);
  useEffect(() => {
    void load();
  }, [load]);
  const selected = result?.graph.nodes.find((n) => n.id === focus);
  const edges =
    result?.graph.edges.filter(
      (e) => e.source === focus || e.target === focus,
    ) || [];
  const neighborIds = [
    ...new Set(edges.map((e) => (e.source === focus ? e.target : e.source))),
  ];
  const neighbors = neighborIds
    .map((id) => result?.graph.nodes.find((n) => n.id === id))
    .filter(Boolean) as Node[];
  return (
    <section className="panel intelligence-panel episode-panel">
      <span className="eyebrow">RECONSTRUCT AND VERIFY</span>
      <h2>Searchable event episodes</h2>
      <p>
        Repeated detections and interpretations are grouped into episodes.
        Original records remain available. Tracks are anonymous associations;
        unresolved activity is never confirmed theft.
      </p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="intel-form"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          void load();
        }}
      >
        <label>
          Search activity, anonymous track or evidence ID
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
            placeholder="possible_carry, package, track ID…"
          />
        </label>
        <div className="intel-fields">
          <label>
            Timeline recording
            <select
              value={recording}
              onChange={(e) => {
                setRecording(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All scoped recordings</option>
              {result?.recordings.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            From source seconds
            <input
              type="number"
              min="0"
              step=".001"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label>
            To source seconds
            <input
              type="number"
              min="0"
              step=".001"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setOffset(0);
              }}
            />
          </label>
        </div>
        <button className="button secondary" disabled={busy}>
          Refresh episode timeline · no model calls
        </button>
      </form>
      <p className="small muted" role="status">
        {busy || (!result && !error)
          ? "Loading the episode timeline…"
          : error
            ? "The episode timeline could not be refreshed."
            : !result?.total
              ? "No episodes match these filters in the indexed evidence."
              : `${result.total} episodes · ${result.chronology_description}. Times between evidence samples remain unverified.`}
      </p>
      <div className="episode-layout">
        <div className="episode-list">
          {result?.items.map((e) => (
            <article key={e.id} className="intel-finding">
              <button
                className="intel-track"
                onClick={() => setFocus(e.id)}
                aria-pressed={focus === e.id}
              >
                <strong>
                  {ts(e.start)}–{ts(e.end)} · {pretty(e.kind)}
                </strong>
                <span>
                  {e.state} · {e.sample_count} source samples ·{" "}
                  {e.support_record_count} support records
                </span>
                <span>
                  {e.clock_status} {e.camera_start || ""}
                </span>
              </button>
              <p className="small muted">
                {e.person_track || "Person assignment unresolved"}
              </p>
              <button
                className="button secondary"
                onClick={() => onOpen(e.asset_id, e.start, e.source_id)}
              >
                Review source video
              </button>
            </article>
          ))}
          {!busy && !result?.items.length && (
            <p>No supported episodes match this scope.</p>
          )}
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous episodes
            </button>
            <button
              className="button secondary"
              disabled={busy || !result || offset + 25 >= result.total}
              onClick={() => setOffset(offset + 25)}
            >
              Next episodes
            </button>
          </div>
        </div>
        <div className="episode-graph">
          <h3>Episode evidence graph</h3>
          {selected && (
            <>
              <p>
                <strong>
                  {pretty(selected.kind)}: {selected.label}
                </strong>
              </p>
              <svg
                viewBox="0 0 600 360"
                role="img"
                aria-label="Selected evidence node and its source relationships"
              >
                {neighbors.slice(0, 8).map((n, i) => {
                  const angle =
                    (i / Math.min(neighbors.length, 8)) * Math.PI * 2;
                  const x = 300 + 210 * Math.cos(angle),
                    y = 180 + 130 * Math.sin(angle);
                  return (
                    <g key={n.id}>
                      <line
                        x1="300"
                        y1="180"
                        x2={x}
                        y2={y}
                        stroke="currentColor"
                        opacity=".4"
                      />
                      <circle cx={x} cy={y} r="15" fill="var(--evidence)" />
                      <text
                        x={x}
                        y={y + 30}
                        textAnchor="middle"
                        fill="currentColor"
                        fontSize="11"
                      >
                        {pretty(n.kind)}
                      </text>
                    </g>
                  );
                })}
                <circle cx="300" cy="180" r="40" fill="var(--evidence)" />
                <text
                  x="300"
                  y="184"
                  textAnchor="middle"
                  fill="var(--bg)"
                  fontSize="11"
                >
                  {pretty(selected.kind)}
                </text>
              </svg>
              <p className="small muted">
                Diagram shows up to eight neighbors. All {neighbors.length}{" "}
                linked nodes are listed below.
              </p>
              <div className="episode-neighbors">
                {neighbors.map((n) => (
                  <button
                    className="intel-track"
                    key={n.id}
                    onClick={() => setFocus(n.id)}
                  >
                    <strong>
                      {pretty(n.kind)} · {n.label}
                    </strong>
                    <span>
                      {edges
                        .filter((e) => e.source === n.id || e.target === n.id)
                        .map((e) => pretty(e.relationship))
                        .join(", ")}
                    </span>
                  </button>
                ))}
              </div>
              {selected.kind === "frame" && !!selected.data.source_id && (
                <a
                  href={String(selected.data.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original evidence frame ↗
                </a>
              )}
              {selected.kind === "frame" && !selected.data.source_id && (
                <p>
                  Evidence unavailable. Source binding could not be verified.
                </p>
              )}
              {selected.kind === "event_episode" && (
                <>
                  <p>{String(selected.data.uncertainty)}</p>
                  <p className="small muted">
                    Source SHA-256: {String(selected.data.source_sha256)}
                  </p>
                  <div className="intel-refs">
                    {neighbors
                      .filter(
                        (node) =>
                          node.kind === "frame" && !!node.data.source_id,
                      )
                      .map((node) => (
                        <a
                          key={node.id}
                          href={String(node.data.url)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Original frame {node.label} ↗
                        </a>
                      ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
