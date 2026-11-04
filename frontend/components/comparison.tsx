"use client";
import { useCallback, useEffect, useState } from "react";
import { api, post, type Asset } from "./types";
type View = {
  frame_id: string;
  url: string;
  timestamp: number;
  count: number | null;
  potential_occlusion: boolean;
};
type Proposal = {
  from_reference: string;
  to_reference: string;
  from_frame: string;
  to_frame: string;
  from_frame_url: string;
  to_frame_url: string;
  gap_seconds: number;
  ambiguous: boolean;
  basis: string;
};
type ComparisonResult = {
  before: View;
  after: View;
  roi: [number, number, number, number];
  after_roi_polygon: [number, number][] | null;
  fixed_shelf_comparable: boolean;
  visible_detection_delta: number | null;
  independent_inventory_delta: number | null;
  uncertainty: string;
  visual_stock_discrepancy: { reason?: string };
  camera_motion: unknown;
  source_provenance: unknown;
  inventory_discrepancy: unknown;
};

function ShelfFrame({
  view,
  label,
  polygon,
}: {
  view: View;
  label: string;
  polygon: [number, number][] | null;
}) {
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <figcaption>
        {label} · {view.timestamp.toFixed(3)}s · visible detections{" "}
        {view.count ?? "unavailable"}
      </figcaption>
      <div style={{ position: "relative" }}>
        <img
          src={view.url}
          alt={`${label} source frame`}
          style={{ display: "block", width: "100%", height: "auto" }}
          loading="lazy"
        />
        {polygon && (
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <polygon
              points={polygon.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="rgba(255, 210, 70, 0.12)"
              stroke="#ffd246"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
    </figure>
  );
}
export default function ComparisonPanel({
  caseId,
  canWrite,
  onChanged,
}: {
  caseId: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [assets, setAssets] = useState<Asset[]>([]),
    [aid, setAid] = useState(""),
    [label, setLabel] = useState("cardboard box"),
    [views, setViews] = useState<View[]>([]),
    [before, setBefore] = useState(""),
    [after, setAfter] = useState(""),
    [result, setResult] = useState<ComparisonResult | null>(null),
    [error, setError] = useState(""),
    [proposals, setProposals] = useState<Proposal[]>([]),
    [warnings, setWarnings] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [videos, scope, p, saved] = await Promise.all([
      api<Asset[]>("/videos"),
      api<{ asset_ids: string[] }>(`/cases/${caseId}/discovery`),
      api<{ proposals: Proposal[]; warnings: { reason: string }[] }>(
        `/cases/${caseId}/association-proposals`,
      ),
      api<{ rows: ComparisonResult[] } | null>(
        `/cases/${caseId}/stock-comparisons`,
      ),
    ]);
    setAssets(videos.filter((a) => scope.asset_ids.includes(a.id)));
    setProposals(p.proposals);
    setWarnings([...new Set(p.warnings.map((w) => w.reason))]);
    setResult(saved?.rows[0] ?? null);
  }, [caseId]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!aid) return;
    void api<{ views: View[] }>(
      `/videos/${aid}/stock-views?label=${encodeURIComponent(label)}`,
    )
      .then((d) => {
        setViews(d.views);
        setBefore("");
        setAfter("");
      })
      .catch((e) => setError(e.message));
  }, [aid, label]);
  return (
    <section className="panel intelligence-panel">
      <span className="eyebrow">COMPARE AND VERIFY</span>
      <h2>Stock changes and anonymous camera links</h2>
      <p>
        Compare visible object counts with source frames. A difference may
        reflect occlusion or detection errors; it does not confirm removal.
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
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          void api<{ rows: ComparisonResult[] }>(
            `/cases/${caseId}/stock-comparisons`,
            post({
              before_frame_id: before,
              after_frame_id: after,
              labels: [label],
              roi: ["roiLeft", "roiTop", "roiRight", "roiBottom"].map((key) =>
                Number(form.get(key)),
              ),
              independent_before: form.get("inventoryBefore")
                ? Number(form.get("inventoryBefore"))
                : null,
              independent_after: form.get("inventoryAfter")
                ? Number(form.get("inventoryAfter"))
                : null,
              inventory_reference: form.get("inventoryReference") || "",
            }),
          )
            .then((d) => {
              setResult(d.rows[0]);
              onChanged();
            })
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className="intel-fields">
          <label>
            Recording
            <select
              value={aid}
              onChange={(e) => setAid(e.target.value)}
              required
            >
              <option value="">Choose a scoped recording</option>
              {assets.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Object category
            <select value={label} onChange={(e) => setLabel(e.target.value)}>
              {[
                "cardboard box",
                "package",
                "pallet",
                "bag",
                "plant",
                "flower pot",
                "crate",
              ].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="intel-fields">
          <label>
            Before frame
            <select
              required
              value={before}
              onChange={(e) => setBefore(e.target.value)}
            >
              <option value="">Choose before frame</option>
              {views.map((v) => (
                <option value={v.frame_id} key={v.frame_id}>
                  {v.timestamp.toFixed(3)}s · count {v.count ?? "unqueried"}
                  {v.potential_occlusion ? " · possible occlusion" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            After frame
            <select
              required
              value={after}
              onChange={(e) => setAfter(e.target.value)}
            >
              <option value="">Choose after frame</option>
              {views.map((v) => (
                <option value={v.frame_id} key={v.frame_id}>
                  {v.timestamp.toFixed(3)}s · count {v.count ?? "unqueried"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="intel-refs">
          {before && (
            <a
              target="_blank"
              rel="noreferrer"
              href={views.find((view) => view.frame_id === before)?.url}
            >
              Original before frame ↗
            </a>
          )}
          {after && (
            <a
              target="_blank"
              rel="noreferrer"
              href={views.find((view) => view.frame_id === after)?.url}
            >
              Original after frame ↗
            </a>
          )}
        </div>
        <details>
          <summary>Fixed shelf region · normalized image coordinates</summary>
          <p className="small muted">
            Choose the shelf bounds in the before frame. Background alignment
            maps the region into the after frame. Unregistered or cropped
            regions cannot establish an aligned shelf discrepancy.
          </p>
          <div className="intel-fields">
            {[
              ["roiLeft", "Left", 0],
              ["roiTop", "Top", 0],
              ["roiRight", "Right", 1],
              ["roiBottom", "Bottom", 1],
            ].map(([name, label, value]) => (
              <label key={String(name)}>
                {label}
                <input
                  name={String(name)}
                  type="number"
                  min="0"
                  max="1"
                  step=".001"
                  defaultValue={value}
                  required
                />
              </label>
            ))}
          </div>
        </details>
        <details>
          <summary>Optional independent stock records</summary>
          <div className="intel-fields">
            <label>
              Before inventory count
              <input
                type="number"
                name="inventoryBefore"
                min="0"
                max="1000000"
              />
            </label>
            <label>
              After inventory count
              <input
                type="number"
                name="inventoryAfter"
                min="0"
                max="1000000"
              />
            </label>
          </div>
          <label>
            Inventory record reference
            <input
              name="inventoryReference"
              maxLength={1000}
              placeholder="Source document or record ID; authenticity requires verification"
            />
          </label>
        </details>
        <button
          className="button secondary"
          disabled={!canWrite || busy || !before || !after}
        >
          Save evidence-linked comparison
        </button>
      </form>
      {result && (
        <div className="intel-finding">
          <strong>Unresolved comparison · human verification required</strong>
          <div className="intel-fields">
            <ShelfFrame
              view={result.before}
              label="Before"
              polygon={[
                [result.roi[0], result.roi[1]],
                [result.roi[2], result.roi[1]],
                [result.roi[2], result.roi[3]],
                [result.roi[0], result.roi[3]],
              ]}
            />
            <ShelfFrame
              view={result.after}
              label="After"
              polygon={result.after_roi_polygon}
            />
          </div>
          <p>
            Visible detection change:{" "}
            {String(result.visible_detection_delta ?? "not comparable")}.
            Independent inventory change:{" "}
            {String(result.independent_inventory_delta ?? "not supplied")}.
          </p>
          <p>{String(result.uncertainty)}</p>
          {result.visual_stock_discrepancy.reason && (
            <p>
              Aligned shelf comparison unavailable.{" "}
              {result.visual_stock_discrepancy.reason}
            </p>
          )}
          <p>
            Fixed shelf registration:{" "}
            {result.fixed_shelf_comparable
              ? "comparable background alignment"
              : "unverified or outside view"}
            . Possible removal: UNRESOLVED. Human conclusion: none recorded.
            Confirmed removal: false.
          </p>
          <details>
            <summary>Comparison provenance and visibility checks</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(
                {
                  camera_motion: result.camera_motion,
                  source_provenance: result.source_provenance,
                  visual_stock_discrepancy: result.visual_stock_discrepancy,
                  inventory_discrepancy: result.inventory_discrepancy,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      )}
      <h3>Possible links between cameras</h3>
      <p>
        Requires verified source clocks. Clothing colour and timing suggest
        review candidates; anonymous tracks remain separate.
      </p>
      <button
        className="button secondary"
        onClick={() => void refresh().catch((e) => setError(e.message))}
      >
        Refresh camera link proposals · no model calls
      </button>
      {warnings.map((w) => (
        <p className="small muted" key={w}>
          {w}
        </p>
      ))}
      {!proposals.length && (
        <p className="muted">
          No supported link proposal is available from the current source
          metadata.
        </p>
      )}
      {proposals.map((p, i) => (
        <article className="intel-finding" key={i}>
          <p>
            {p.from_reference} → {p.to_reference}
          </p>
          <p>
            {p.gap_seconds.toFixed(2)}s transition ·{" "}
            {p.ambiguous
              ? "multiple similar alternatives"
              : "unverified candidate"}
          </p>
          <p>{p.basis}</p>
          <div className="intel-refs">
            <a target="_blank" rel="noreferrer" href={p.from_frame_url}>
              Departure frame ↗
            </a>
            <a target="_blank" rel="noreferrer" href={p.to_frame_url}>
              Arrival frame ↗
            </a>
          </div>
          <button
            className="button secondary"
            disabled={!canWrite}
            onClick={() =>
              void api(
                `/cases/${caseId}/camera-associations`,
                post({
                  from_reference: `frame:${p.from_frame}`,
                  to_reference: `frame:${p.to_frame}`,
                  state: "unverified",
                  evidence_notes:
                    "Generated clothing/time candidate selected for review. Identity is unverified. " +
                    p.basis,
                }),
              )
                .then(onChanged)
                .catch((e) => setError(e.message))
            }
          >
            Record as an unverified lead
          </button>
        </article>
      ))}
    </section>
  );
}
