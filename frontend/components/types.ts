export type User = { id: string; email: string; name: string; role: string };
export type Asset = {
  id: string;
  name: string;
  camera: string;
  status: string;
  sha256: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  size: number;
  synthetic: boolean;
  created: string;
};
export type Evidence = {
  source_id?: string | null;
  source_frames?: { asset_id: string; source_id?: string | null }[];
  camera_timestamp?: string | null;
  id: string;
  asset_id: string;
  title: string;
  description: string;
  type: string;
  category: string;
  severity: string;
  start: number;
  end: number;
  provenance: string;
  camera: string;
  synthetic: boolean;
};
export type Investigation = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  status: string;
  created: string;
  evidence_count: number;
};
export type Run = {
  id: string;
  model: string;
  provider: string;
  status: string;
  routing: string;
  elapsed_ms: number;
  usage: Record<string, unknown>;
};
export type Observation = {
  id: string;
  frame_id?: string | null;
  timestamp: number;
  label: string;
  track_id: string;
  box: number[];
  provenance: string;
};
export type PinnedPlayback = {
  source_id: string;
  source_sha256: string;
  url: string;
  frames: Record<string, { url: string; timestamp: number }>;
};
export type AssetDetail = Asset & {
  job: {
    status: string;
    stage: string;
    progress: number;
    error: string | null;
    attempts: number;
    elapsed_ms: number;
  };
  events: Evidence[];
  observations: Observation[];
  runs: Run[];
  frames: { id: string; timestamp: number }[];
};
export type Report = {
  id: string;
  version: number;
  status: string;
  notes: string;
  created: string;
  reviewed: string | null;
  content: {
    scope: string;
    purpose: string;
    methodology: string;
    observations: Evidence[];
    interpretations: Evidence[];
    timeline: Evidence[];
    human_conclusion: string;
    uncertainty: string;
    integrity: {
      asset_id: string;
      sha256: string;
      name: string;
      synthetic: boolean;
    }[];
    models: Run[];
    limitations: string;
    possible_hypotheses?: {
      id: string;
      label: string;
      data: Record<string, unknown>;
    }[];
    contradictory_evidence?: {
      id: string;
      label: string;
      data: Record<string, unknown>;
    }[];
    missing_evidence?: string[];
  };
};
export type CaseDetail = Investigation & {
  events: Evidence[];
  reports: Report[];
  time_policy: string;
  members: User[];
};
export type Dashboard = {
  assets: number;
  events: number;
  cases: number;
  alerts: number;
  processing: number;
  failed: number;
  recordings: Asset[];
  recent_events: Evidence[];
  distribution: { type: string; count: number }[];
};
export type AlertItem = {
  id: string;
  status: string;
  reason: string;
  updated: string;
  event: Evidence;
};
export type Settings = {
  provider_status: string;
  mode: string;
  models: { id: string; purpose: string; status: string }[];
  limits: Record<string, string | number>;
  retention: string;
  live_cameras: string;
  calibration: string;
};
export type AuditItem = {
  seq: number;
  action: string;
  actor: string;
  target: string;
  detail: Record<string, unknown>;
  hash: string;
  previous: string;
  created: string;
};
export type AssistantAnswer = {
  claims: {
    text: string;
    category: string;
    evidence_ids: string[];
    asset_id?: string;
    start?: number;
  }[];
  uncertainty: string;
  notice?: string;
  mode: string;
  sources: Evidence[];
};
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.error?.message || `Request failed (${res.status})`,
      res.status,
    );
  }
  return res.json();
}
export const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});
export const timecode = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
export const humanize = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
