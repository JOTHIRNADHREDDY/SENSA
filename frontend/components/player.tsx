"use client";
import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Maximize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AssetDetail, type PinnedPlayback, timecode, api } from "./types";

export default function Player({
  asset,
  seek,
  onTime,
}: {
  asset: AssetDetail;
  seek: { time: number; key: number; sourceId?: string };
  onTime?: (t: number) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [overlays, setOverlays] = useState(true);
  const [masks, setMasks] = useState(false);
  const [maskError, setMaskError] = useState(false);
  const [people, setPeople] = useState(true);
  const [objects, setObjects] = useState(true);
  const [aspect, setAspect] = useState(asset.width / asset.height);
  const [nativeDuration, setNativeDuration] = useState<number | null>(null);
  const duration = nativeDuration ?? asset.duration;
  type Intelligence = {
    source: { id: string };
    assignments: Record<string, { track_id: string }>;
    continuity: { changes: { index: number; timestamp: number }[] };
  };
  const [evidence, setEvidence] = useState<{
    key: string;
    playback: PinnedPlayback;
    intelligence: Intelligence | null;
  } | null>(null);
  const [error, setError] = useState("");
  const sourceKey = `${asset.id}:${seek.sourceId ?? ""}`;
  const playback = evidence?.key === sourceKey ? evidence.playback : null;
  const intelligence =
    evidence?.key === sourceKey ? evidence.intelligence : null;
  useEffect(() => {
    setNativeDuration(null);
    setFrameReady(false);
    setError("");
  }, [sourceKey]);
  useEffect(() => {
    let live = true;
    const query = seek.sourceId
      ? `?source_id=${encodeURIComponent(seek.sourceId)}`
      : "";
    void api<{
      snapshot: { data: Intelligence } | null;
      playback: PinnedPlayback;
    }>(`/videos/${asset.id}/intelligence${query}`)
      .then((r) => {
        if (live)
          setEvidence({
            key: sourceKey,
            playback: r.playback,
            intelligence:
              r.snapshot?.data.source.id === r.playback.source_id
                ? r.snapshot.data
                : null,
          });
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [asset.id, asset.observations.length, seek.sourceId, sourceKey]);
  useEffect(() => {
    if (video.current) {
      video.current.currentTime = seek.time;
      setTime(seek.time);
    }
  }, [seek, asset.id]);
  const observations = asset.observations.filter(
    (o) =>
      Math.abs(o.timestamp - time) <= 0.55 / asset.fps &&
      (!!intelligence?.assignments[o.id] ||
        (o.provenance === "fixture_annotation" &&
          playback?.source_sha256 === asset.sha256)) &&
      !!playback?.frames[o.frame_id ?? ""] &&
      (o.label === "person" ? people : objects),
  );
  const sampled = Object.values(playback?.frames ?? {}).sort(
    (a, b) => Math.abs(a.timestamp - time) - Math.abs(b.timestamp - time),
  )[0];
  function step(delta: number) {
    if (!video.current) return;
    video.current.pause();
    const t = Math.max(
      0,
      Math.min(duration, video.current.currentTime + delta / asset.fps),
    );
    video.current.currentTime = t;
    setTime(t);
    onTime?.(t);
  }
  function toggle() {
    if (!video.current) return;
    if (video.current.paused)
      video.current.play().catch(() => setPlaying(false));
    else video.current.pause();
  }
  return (
    <div className="player-shell">
      <div className="video-stage" style={{ aspectRatio: aspect }}>
        {playback && (
          <video
            ref={video}
            src={playback.url}
            muted={muted}
            playsInline
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onLoadedData={() => setFrameReady(!video.current?.seeking)}
            onSeeking={() => setFrameReady(false)}
            onSeeked={() => setFrameReady(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onLoadedMetadata={() => {
              if (video.current) {
                video.current.currentTime = seek.time;
                setAspect(video.current.videoWidth / video.current.videoHeight);
                if (Number.isFinite(video.current.duration))
                  setNativeDuration(video.current.duration);
              }
            }}
            onTimeUpdate={() => {
              const t = video.current?.currentTime || 0;
              setTime(t);
              onTime?.(t);
            }}
            onClick={toggle}
            onError={() =>
              setError(
                "The bound source video could not be played. Review the source and frame links.",
              )
            }
            aria-label={`${asset.camera} recording`}
          />
        )}
        {!playback && !error && <p role="status">Loading verified source…</p>}
        {error && <p role="alert">{error}</p>}
        <div className="video-top">
          <span className="video-recorded">
            <i /> RECORDED FOOTAGE
          </span>
          <span>
            {asset.synthetic ? "SYNTHETIC / FIXTURE" : "REGISTERED SOURCE"}
          </span>
        </div>
        {frameReady &&
          overlays &&
          observations.map((o) => (
            <div
              key={o.id}
              className="detection-box"
              style={{
                left: `${o.box[0] * 100}%`,
                top: `${o.box[1] * 100}%`,
                width: `${(o.box[2] - o.box[0]) * 100}%`,
                height: `${(o.box[3] - o.box[1]) * 100}%`,
              }}
            >
              {masks && (
                <img
                  className="detection-mask"
                  alt="Decoded SAM segmentation"
                  src={`/api/observations/${o.id}/mask`}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    setMaskError(true);
                  }}
                />
              )}
              <span>
                {o.label} ·{" "}
                {o.provenance === "fixture_annotation"
                  ? "fixture"
                  : intelligence?.assignments[o.id]?.track_id ||
                    o.track_id ||
                    "SAM"}
              </span>
            </div>
          ))}
        {playback && !playing && (
          <button
            className="center-play"
            onClick={toggle}
            aria-label="Play recording"
          >
            <Play size={24} fill="currentColor" />
          </button>
        )}
      </div>
      <div className="player-controls">
        <button
          className="icon-button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <span className="mono">
          {timecode(time)} <span className="muted">/ {timecode(duration)}</span>
        </span>
        <input
          aria-label="Source timestamp"
          type="range"
          min="0"
          max={duration}
          step={1 / asset.fps}
          value={time}
          onChange={(e) => {
            const t = +e.target.value;
            setTime(t);
            if (video.current) video.current.currentTime = t;
          }}
        />
        <button
          onClick={() => setOverlays(!overlays)}
          className={`icon-button ${overlays ? "accent-text" : ""}`}
          aria-label="Toggle sampled-frame observations"
          title="Observations appear only at their sampled timestamps"
        >
          <Crosshair size={18} />
        </button>
        <button
          className="icon-button"
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={() => setMuted(!muted)}
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <button
          className="icon-button"
          aria-label="Fullscreen"
          onClick={() => video.current?.requestFullscreen()}
        >
          <Maximize2 size={17} />
        </button>
      </div>
      <div className="player-frame-tools">
        <button
          onClick={() => step(-1)}
          aria-label="Step back by nominal frame duration"
        >
          ← Frame
        </button>
        <span>{time.toFixed(3)}s · playback-relative</span>
        <button
          onClick={() => step(1)}
          aria-label="Step forward by nominal frame duration"
        >
          Frame →
        </button>
        <label>
          <input
            type="checkbox"
            checked={people}
            onChange={(e) => setPeople(e.target.checked)}
          />{" "}
          People
        </label>
        <label>
          <input
            type="checkbox"
            checked={objects}
            onChange={(e) => setObjects(e.target.checked)}
          />{" "}
          Objects
        </label>
        <label>
          <input
            type="checkbox"
            checked={masks}
            onChange={(e) => setMasks(e.target.checked)}
          />{" "}
          SAM masks
        </label>
        {sampled && (
          <a href={sampled.url} target="_blank" rel="noreferrer">
            Nearest stored native frame · {sampled.timestamp.toFixed(3)}s ↗
          </a>
        )}
      </div>
      {!!intelligence?.continuity.changes.length && (
        <div className="player-cuts">
          Continuity markers:{" "}
          {intelligence.continuity.changes.map((c) => (
            <button
              key={c.index}
              onClick={() => {
                if (video.current) {
                  video.current.currentTime = c.timestamp;
                  video.current.pause();
                  setTime(c.timestamp);
                }
              }}
            >
              {c.timestamp.toFixed(3)}s
            </button>
          ))}
        </div>
      )}
      {maskError && masks && (
        <p className="player-note">
          Some provider masks cannot be decoded. Raw masks are preserved;
          available boxes remain visible.
        </p>
      )}
      <div className="player-note">
        <Crosshair size={12} /> Boxes appear at sampled source timestamps only.
        No interpolation or identity inference.
      </div>
    </div>
  );
}
