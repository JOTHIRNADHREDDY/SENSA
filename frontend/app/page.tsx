"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crosshair,
  Database,
  Eye,
  FileCheck2,
  FileText,
  Fingerprint,
  FolderOpen,
  Grid2X2,
  LayoutDashboard,
  List,
  Loader2,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  WandSparkles,
  X,
  AlertTriangle,
  Trash2,
  ExternalLink,
  Users,
  ScanLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Player from "@/components/player";
import DiscoveryPanel from "@/components/discovery";
import ComparisonPanel from "@/components/comparison";
import OperationsPanel from "@/components/operations";
import { IntelligencePanel, CaseIntelligence } from "@/components/intelligence";
import EpisodeTimeline from "@/components/episode-timeline";
import {
  api,
  ApiError,
  post,
  timecode,
  humanize,
  type AlertItem,
  type Asset,
  type AssetDetail,
  type AssistantAnswer,
  type AuditItem,
  type CaseDetail,
  type Dashboard,
  type Evidence,
  type Investigation,
  type Report,
  type Settings,
  type User,
} from "@/components/types";

type Page =
  | "overview"
  | "library"
  | "events"
  | "investigations"
  | "alerts"
  | "settings"
  | "audit";
type Modal = "upload" | "case" | "help" | "user" | null;
const navigation: {
  id: Page;
  label: string;
  icon: LucideIcon;
  group?: string;
}[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "library", label: "Video library", icon: Video },
  { id: "events", label: "Event search", icon: ScanLine },
  { id: "investigations", label: "Investigations", icon: FolderOpen },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings2, group: "WORKSPACE" },
  { id: "audit", label: "Audit trail", icon: Fingerprint },
];
const emptyDashboard: Dashboard = {
  assets: 0,
  events: 0,
  cases: 0,
  alerts: 0,
  processing: 0,
  failed: 0,
  recordings: [],
  recent_events: [],
  distribution: [],
};

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <svg viewBox="0 0 38 38" aria-hidden="true">
        <path d="M5 15V5h10M23 5h10v10M33 23v10H23M15 33H5V23" />
        <circle cx="19" cy="19" r="7" />
      </svg>
      <span>
        sensa<span className="logo-period">.</span>
      </span>
    </div>
  );
}
function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Status({ status }: { status: string }) {
  const good = ["succeeded", "approved", "acknowledged"].includes(status);
  return (
    <span
      className={`status ${good ? "good" : ["failed", "rejected"].includes(status) ? "danger" : "neutral"}`}
    >
      <i />
      {humanize(status === "succeeded" ? "indexed" : status)}
    </span>
  );
}
function Empty({
  icon: Icon = Video,
  title,
  text,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} strokeWidth={1.3} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function SectionHeading({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<
    "signin" | "local" | "public" | null
  >(null);
  const [setup, setSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [dash, setDash] = useState<Dashboard>(emptyDashboard);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cases, setCases] = useState<Investigation[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeWorkers, setActiveWorkers] = useState<number | null>(null);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [activeCase, setActiveCase] = useState<CaseDetail | null>(null);
  const [assistantMode, setAssistantMode] = useState("local");
  const [assistantConsent, setAssistantConsent] = useState(false);
  const [caseTab, setCaseTab] = useState<"timeline" | "assistant" | "report">(
    "timeline",
  );
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [camera, setCamera] = useState("");
  const [range, setRange] = useState({ start: "", end: "" });
  const [results, setResults] = useState<Evidence[]>([]);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryLayout, setLibraryLayout] = useState<"grid" | "list">("grid");
  const [seek, setSeek] = useState<{
    time: number;
    key: number;
    sourceId?: string;
  }>({ time: 0, key: 0 });
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [question, setQuestion] = useState("");
  const [feedback, setFeedback] = useState<{
    id: string;
    status: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [addEvidence, setAddEvidence] = useState<Evidence | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [reviewing, setReviewing] = useState<Report | null>(null);
  const [shareCase, setShareCase] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((text: string, error = false) => {
    setNotice({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(null), error ? 9000 : 5000);
  }, []);

  useEffect(() => {
    async function openWorkspace() {
      try {
        const health = await api<{
          setup_required: boolean;
          auth_mode: "signin" | "local" | "public";
          active_workers: number;
        }>("/health");
        setActiveWorkers(health.active_workers);
        setAuthMode(health.auth_mode);
        setSetup(health.setup_required);
        if (health.auth_mode === "local") {
          setUser(await api<User>("/auth/local", post({})));
        } else if (health.auth_mode === "public") {
          setUser(await api<User>("/auth/me"));
        } else {
          try {
            setUser(await api<User>("/auth/me"));
          } catch (error) {
            if (!(error instanceof ApiError && error.status === 401))
              throw error;
          }
        }
      } catch {
        setOffline(true);
      } finally {
        setLoading(false);
      }
    }
    void openWorkspace();
  }, []);
  const refresh = useCallback(async () => {
    try {
      const [d, a, c, al, s, health] = await Promise.all([
        api<Dashboard>("/dashboard"),
        api<Asset[]>("/videos"),
        api<Investigation[]>("/cases"),
        api<AlertItem[]>("/alerts"),
        api<Settings>("/settings"),
        api<{ active_workers: number }>("/health"),
      ]);
      setActiveWorkers(health.active_workers);
      setDash(d);
      setAssets(a);
      setCases(c);
      setAlerts(al);
      setSettings(s);
      setOffline(false);
      if (
        a.filter(
          (v) => v.synthetic && ["succeeded", "failed"].includes(v.status),
        ).length >= 4
      )
        setDemoLoading(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        if (authMode === "local" || authMode === "public") {
          try {
            setUser(
              authMode === "public"
                ? await api<User>("/auth/me")
                : await api<User>("/auth/local", post({})),
            );
          } catch {
            setOffline(true);
          }
        } else setUser(null);
      } else setOffline(true);
    }
  }, [authMode]);
  useEffect(() => {
    if (!user) return;
    void refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [user, refresh]);
  useEffect(() => {
    if (page === "audit" && user?.role === "admin")
      api<AuditItem[]>("/audit")
        .then(setAudit)
        .catch((e) => notify(e.message, true));
  }, [page, user, notify]);
  useEffect(() => {
    if (!asset || !["running", "queued"].includes(asset.status)) return;
    const id = setInterval(
      () =>
        api<AssetDetail>(`/videos/${asset.id}`)
          .then(setAsset)
          .catch((e) => notify(e.message, true)),
      2000,
    );
    return () => clearInterval(id);
  }, [asset, notify]);
  useEffect(() => {
    if (user && page === "events") {
      const p = new URLSearchParams({
        q: search,
        type: eventType,
        camera,
        start: range.start || "0",
        end: range.end || "28800",
      });
      api<{ items: Evidence[]; filters: Record<string, unknown> }>(
        `/events?${p}`,
      )
        .then((r) => {
          setResults(r.items);
          setFilters(r.filters);
        })
        .catch((e) => notify(e.message, true));
    }
  }, [user, page, search, eventType, camera, range, notify]);
  useEffect(() => {
    if (
      modal ||
      feedback ||
      deleteTarget ||
      addEvidence ||
      reviewing ||
      shareCase
    ) {
      const previousFocus = document.activeElement as HTMLElement | null;
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const focusables = () =>
        Array.from(
          dialog?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]",
          ) || [],
        );
      const initial =
        dialog?.querySelector<HTMLElement>("input, textarea, select") ||
        focusables()[0];
      initial?.focus();
      const close = (e: KeyboardEvent) => {
        if (e.key === "Tab") {
          const nodes = focusables();
          const first = nodes[0];
          const last = nodes[nodes.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
        if (e.key === "Escape") {
          setModal(null);
          setFeedback(null);
          setDeleteTarget(null);
          setAddEvidence(null);
          setReviewing(null);
          setShareCase(false);
        }
      };
      window.addEventListener("keydown", close);
      return () => {
        window.removeEventListener("keydown", close);
        previousFocus?.focus();
      };
    }
  }, [modal, feedback, deleteTarget, addEvidence, reviewing, shareCase]);

  function navigate(p: Page) {
    setPage(p);
    setAsset(null);
    setActiveCase(null);
    setMobileNav(false);
    setAnswer(null);
    window.scrollTo(0, 0);
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Something went wrong", true);
    } finally {
      setBusy(false);
    }
  }
  async function openAsset(id: string, time = 0, sourceId?: string) {
    await run(async () => {
      const detail = await api<AssetDetail>(`/videos/${id}`);
      setAsset(detail);
      setSeek({ time, key: Date.now(), sourceId });
      window.scrollTo(0, 0);
    });
  }
  function openEvidence(event: Evidence) {
    const references = new Set(
      event.source_frames?.map((frame) =>
        frame.asset_id === event.asset_id ? frame.source_id : null,
      ),
    );
    const sourceId =
      event.source_id || (references.size === 1 ? [...references][0] : null);
    if (!sourceId) {
      notify(
        "Evidence playback unavailable. The recording registration could not be verified.",
        true,
      );
      return;
    }
    void openAsset(event.asset_id, event.start, sourceId);
  }
  async function openCase(id: string) {
    await run(async () => {
      setActiveCase(await api<CaseDetail>(`/cases/${id}`));
      setPage("investigations");
      setAsset(null);
      setAnswer(null);
      setCaseTab("timeline");
    });
  }
  async function updateCase() {
    if (activeCase)
      setActiveCase(await api<CaseDetail>(`/cases/${activeCase.id}`));
    await refresh();
  }
  async function loadDemo() {
    await run(async () => {
      setDemoLoading(true);
      await api("/demo", post({}));
      notify("Generating synthetic recordings. This takes a few seconds.");
      await refresh();
    });
  }
  const canWrite = user?.role !== "viewer";
  const canReview = user?.role === "reviewer" || user?.role === "admin";
  const latest = activeCase?.reports[0];

  if (loading)
    return (
      <div className="boot-screen">
        <Logo />
        <Loader2 className="spin" size={20} />
        <span>Connecting to your workspace</span>
      </div>
    );
  if (!user && authMode !== "signin")
    return (
      <div className="boot-screen">
        <Logo />
        <h2>Workspace unavailable</h2>
        <p className="muted">
          Start the local backend, then reopen your workspace.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Retry connection
          <ArrowRight size={15} />
        </button>
      </div>
    );
  if (!user)
    return (
      <div className="auth-page">
        <div className="auth-art">
          <Logo />
          <div className="auth-copy">
            <span className="eyebrow accent-text">
              VISUAL INTELLIGENCE, WITH CONTEXT
            </span>
            <h1>
              See what happened.
              <br />
              <em>Understand what matters.</em>
            </h1>
            <p>
              From recorded footage to a clear, evidence-linked investigation.
              Meet the workspace that connects the dots.
            </p>
            <div className="auth-pills">
              <span>
                <ShieldCheck size={15} /> Protected evidence
              </span>
              <span>
                <Fingerprint size={15} /> Traceable by design
              </span>
            </div>
          </div>
          <div className="auth-visual">
            <div className="scan-ring r1" />
            <div className="scan-ring r2" />
            <div className="scan-ring r3" />
            <Crosshair size={120} strokeWidth={0.5} />
            <span className="visual-tag">
              <i /> CONTEXT CHANGES EVERYTHING
            </span>
          </div>
          <span className="auth-footer">
            CAMERAS THAT UNDERSTAND <span>SENSA / 2026</span>
          </span>
        </div>
        <div className="auth-form-side">
          <div className="auth-form">
            <Badge tone="lime">YOUR EVIDENCE. YOUR CONTROL.</Badge>
            <h2>
              {setup ? "A clearer picture starts here." : "Welcome back."}
            </h2>
            <p>
              {setup
                ? "Create your local workspace and its first administrator account."
                : "Sign in to your visual intelligence workspace."}
            </p>
            {offline && (
              <div className="inline-error">
                Backend is unavailable. Start the API on port 8001, then
                refresh.
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const u = await api<User>(
                    setup ? "/auth/setup" : "/auth/login",
                    post({
                      email: f.get("email"),
                      password: f.get("password"),
                      name: f.get("name") || "Analyst",
                    }),
                  );
                  setUser(u);
                  setSetup(false);
                  setOffline(false);
                });
              }}
            >
              {setup && (
                <label>
                  Your name
                  <input
                    name="name"
                    placeholder="Alex Morgan"
                    required
                    maxLength={80}
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  placeholder={
                    setup ? "At least 12 characters" : "Your password"
                  }
                  minLength={12}
                  maxLength={128}
                  autoComplete={setup ? "new-password" : "current-password"}
                  required
                />
              </label>
              <button
                className="button primary full"
                disabled={busy || offline}
              >
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <>
                    {setup ? "Create workspace" : "Open workspace"}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
            <div className="auth-security">
              <LockKeyhole size={15} />
              <span>
                Local, secure demo authentication.
                <br />
                Model credentials remain on your server.
              </span>
            </div>
          </div>
        </div>
        {notice && (
          <div className={`toast ${notice.error ? "error" : ""}`} role="status">
            {notice.text}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    );

  function recordingCard(a: Asset) {
    return (
      <button
        className="recording-card"
        key={a.id}
        onClick={() => void openAsset(a.id)}
      >
        <div className="recording-image">
          {!["running", "queued"].includes(a.status) && (
            <img
              src={`/api/videos/${a.id}/thumbnail`}
              alt={`${a.camera}, historical preview with unverified source lineage`}
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          )}
          <div className="camera-image-shade" />
          <span className="camera-number">
            <Video size={12} /> SOURCE {a.id.slice(0, 4).toUpperCase()}
          </span>
          <span className="recording-label">
            <i />
            {a.synthetic ? "SYNTHETIC PREVIEW" : "HISTORICAL PREVIEW"}
          </span>
          <span className="recording-play">
            <Eye size={17} />
          </span>
          <span className="recording-time mono">{timecode(a.duration)}</span>
        </div>
        <div className="recording-meta">
          <div>
            <h3>{a.camera}</h3>
            <p>
              <MapPin size={11} />
              {a.synthetic ? "Warehouse · Demo environment" : a.name}
            </p>
          </div>
          <ArrowUpRight size={17} />
        </div>
        <div className="recording-footer">
          <Status status={a.status} />
          <span>
            {a.width} × {a.height} <span className="separator">·</span> {a.fps}{" "}
            FPS
          </span>
        </div>
      </button>
    );
  }
  function evidenceRows(items: Evidence[], allowAdd = true) {
    return (
      <div className="event-rows">
        {items.map((e) => (
          <div className="event-row" key={e.id}>
            <div
              className={`event-symbol ${e.severity === "warning" ? "amber" : ""}`}
            >
              {e.type === "zone_entry" ? (
                <Crosshair size={16} />
              ) : e.type === "movement" ? (
                <Activity size={16} />
              ) : (
                <Eye size={16} />
              )}
            </div>
            <button className="event-copy" onClick={() => openEvidence(e)}>
              <strong>{e.title}</strong>
              <span>
                {e.camera}
                <span className="separator">·</span>
                {e.provenance === "meta_inference"
                  ? "Meta inference"
                  : e.provenance === "fixture_annotation"
                    ? "Synthetic fixture"
                    : humanize(e.provenance)}
                {e.synthetic && e.provenance !== "fixture_annotation"
                  ? " · synthetic footage"
                  : ""}
              </span>
            </button>
            <span className="mono event-timestamp">{timecode(e.start)}</span>
            <Badge tone={e.category === "inferred" ? "amber" : "gray"}>
              {e.category}
            </Badge>
            {allowAdd && canWrite ? (
              <button
                className="icon-button add-evidence"
                aria-label={`Add ${e.title} to an investigation`}
                title="Add to investigation"
                onClick={() => setAddEvidence(e)}
              >
                <Plus size={17} />
              </button>
            ) : (
              <button
                className="icon-button"
                aria-label={`View ${e.title}`}
                onClick={() => openEvidence(e)}
              >
                <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-backdrop"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
          aria-label="SENSA overview"
        >
          <Logo />
        </a>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Box size={18} />
          </span>
          <div>
            <strong>Warehouse workspace</strong>
            <span>
              {authMode === "public" ? "PUBLIC WORKSPACE" : "LOCAL ENVIRONMENT"}
            </span>
          </div>
          {authMode !== "public" && <LockKeyhole size={12} />}
        </div>
        <div className="nav-label">PLATFORM</div>
        <nav>
          {navigation
            .filter((n) => n.id !== "audit" || user.role === "admin")
            .map((n) => (
              <div key={n.id}>
                {n.group && <div className="nav-label spaced">{n.group}</div>}
                <button
                  className={`nav-item ${page === n.id ? "active" : ""}`}
                  onClick={() => navigate(n.id)}
                >
                  <n.icon size={18} strokeWidth={1.6} />
                  <span>{n.label}</span>
                  {n.id === "alerts" && dash.alerts > 0 && (
                    <b className="nav-count">{dash.alerts}</b>
                  )}
                  {page === n.id && n.id !== "alerts" && (
                    <span className="active-dot" />
                  )}
                </button>
              </div>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="context-card">
            <span className="context-orb">
              <Sparkles size={18} />
            </span>
            <strong>
              A little context.
              <br />A lot more clarity.
            </strong>
            <p>
              Explore a complete investigation with synthetic warehouse footage.
            </p>
            <button
              disabled={busy || demoLoading || !canWrite}
              onClick={() => void loadDemo()}
            >
              {demoLoading ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <ArrowUpRight size={15} />
              )}
              {demoLoading ? "Preparing demo…" : "Explore the demo"}
            </button>
          </div>
          <button className="nav-item help" onClick={() => setModal("help")}>
            <CircleHelp size={18} />
            Help & documentation
            <ArrowUpRight size={13} />
          </button>
          <div className="user-card">
            <span className="avatar">
              {user.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <span>
                {authMode === "local"
                  ? "Local access · Administrator"
                  : authMode === "public"
                    ? "Public access · Investigator"
                    : humanize(user.role)}
              </span>
            </div>
            {authMode === "signin" && (
              <button
                className="icon-button"
                aria-label="Sign out"
                title="Sign out"
                onClick={() =>
                  void run(async () => {
                    await api("/auth/logout", post({}));
                    setUser(null);
                  })
                }
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {asset
                ? "Recording analysis"
                : activeCase
                  ? "Investigation"
                  : navigation.find((n) => n.id === page)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <span className={`system-status ${offline ? "offline" : ""}`}>
              <i />
              {offline
                ? "CONNECTION LOST"
                : activeWorkers
                  ? `${activeWorkers} ACTIVE ${activeWorkers === 1 ? "WORKER" : "WORKERS"}`
                  : "PROCESSING WORKERS UNAVAILABLE"}
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button notification-button"
              aria-label="View alerts"
              onClick={() => navigate("alerts")}
            >
              <Bell size={18} />
              {dash.alerts > 0 && <i />}
            </button>
            <span className="avatar top-avatar">
              {user.name[0].toUpperCase()}
            </span>
          </div>
        </header>
        {offline && (
          <div className="offline-banner">
            <AlertTriangle size={15} /> Connection lost. Showing the last loaded
            data. Check the API and retry.
            <button onClick={() => void refresh()}>Retry</button>
          </div>
        )}
        <main>
          {asset ? (
            <>
              <button className="back-link" onClick={() => setAsset(null)}>
                <ArrowLeft size={15} />
                Back to{" "}
                {activeCase
                  ? "investigation"
                  : navigation.find((n) => n.id === page)?.label.toLowerCase()}
              </button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">RECORDING ANALYSIS</div>
                  <h1>{asset.camera}</h1>
                  <p>
                    {asset.name}
                    <span className="separator">·</span>Source-relative time
                    <span className="separator">·</span>
                    {asset.synthetic ? "Synthetic footage" : "Uploaded source"}
                  </p>
                </div>
                <Status status={asset.status} />
              </div>
              <div className="analysis-layout">
                <div>
                  <Player asset={asset} seek={seek} />
                  <IntelligencePanel
                    assetId={asset.id}
                    canWrite={canWrite}
                    onSeek={(time) =>
                      setSeek((prior) => ({ ...prior, time, key: Date.now() }))
                    }
                    onChanged={() => {
                      void api<AssetDetail>(`/videos/${asset.id}`)
                        .then(setAsset)
                        .catch(() => {});
                    }}
                  />
                  <div className="panel analysis-events">
                    <SectionHeading
                      title="Evidence timeline"
                      sub="Indexed events with a bound source can seek to their recorded playback time."
                    />
                    <div className="source-timeline">
                      {asset.events.length ? (
                        asset.events.map((e) => (
                          <button
                            key={e.id}
                            onClick={() =>
                              setSeek({
                                time: e.start,
                                key: Date.now(),
                                sourceId: e.source_id ?? undefined,
                              })
                            }
                            disabled={!e.source_id}
                            className="source-event"
                          >
                            <span className="timeline-dot" />
                            <span className="mono">{timecode(e.start)}</span>
                            <div>
                              <strong>{e.title}</strong>
                              <p>{e.description}</p>
                              <Badge
                                tone={
                                  e.category === "inferred" ? "amber" : "gray"
                                }
                              >
                                {e.category}
                              </Badge>
                            </div>
                            <ArrowUpRight size={16} />
                          </button>
                        ))
                      ) : (
                        <Empty
                          icon={ScanLine}
                          title="No indexed events"
                          text="Frames have been sampled. Run an authorized Meta analysis to create observations from this recording."
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="analysis-side">
                  <div className="panel">
                    <SectionHeading title="Initial processing" />
                    <Status status={asset.job.status} />
                    <div className="progress-bar">
                      <span style={{ width: `${asset.job.progress}%` }} />
                    </div>
                    <p className="small muted">
                      {asset.job.stage ===
                      "Frames ready; model analysis not run"
                        ? "Initial ingest decoded frames. See saved analysis runs for later inspections."
                        : asset.job.stage}
                    </p>
                    {asset.job.error && (
                      <p className="inline-error">{asset.job.error}</p>
                    )}
                    <dl className="metadata">
                      <div>
                        <dt>Sampled frames</dt>
                        <dd>{asset.frames.length}</dd>
                      </div>
                      <div>
                        <dt>Processing time</dt>
                        <dd>
                          {asset.job.elapsed_ms
                            ? `${(asset.job.elapsed_ms / 1000).toFixed(2)}s`
                            : "In progress"}
                        </dd>
                      </div>
                      <div>
                        <dt>Attempts</dt>
                        <dd>{asset.job.attempts} / 3</dd>
                      </div>
                    </dl>
                    {canWrite &&
                      !["queued", "running"].includes(asset.status) && (
                        <div className="stack-buttons">
                          <button
                            className="button secondary"
                            onClick={() =>
                              void run(async () => {
                                await api(
                                  `/videos/${asset.id}/process`,
                                  post({ mode: "local" }),
                                );
                                setAsset(
                                  await api<AssetDetail>(`/videos/${asset.id}`),
                                );
                                notify("Processing queued");
                              })
                            }
                          >
                            <Activity size={14} />
                            Retry local processing
                          </button>
                          <button
                            className="button secondary"
                            disabled={
                              !settings ||
                              settings.provider_status === "fixture_mode"
                            }
                            title={
                              settings?.provider_status === "fixture_mode"
                                ? "Configure MODEL_API_KEY on the server"
                                : "Uploads bounded frames to Meta Standard mode"
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Send cut-safe sampled person/object grounding and related scene frames to Meta Standard? At most 12 requests; provider charges apply. Prior results are preserved.",
                                )
                              )
                                void run(async () => {
                                  await api(
                                    `/videos/${asset.id}/process`,
                                    post({
                                      mode: "meta",
                                      authorize_external_processing: true,
                                    }),
                                  );
                                  setAsset(
                                    await api<AssetDetail>(
                                      `/videos/${asset.id}`,
                                    ),
                                  );
                                });
                            }}
                          >
                            <Sparkles size={14} />
                            Analyze with Meta
                          </button>
                        </div>
                      )}
                  </div>
                  <div className="panel">
                    <SectionHeading
                      title="Source integrity"
                      action={<ShieldCheck size={17} className="accent-text" />}
                    />
                    <dl className="metadata">
                      <div>
                        <dt>Resolution</dt>
                        <dd>
                          {asset.width} × {asset.height}
                        </dd>
                      </div>
                      <div>
                        <dt>Duration</dt>
                        <dd>{timecode(asset.duration)}</dd>
                      </div>
                      <div>
                        <dt>Frame rate</dt>
                        <dd>{asset.fps} FPS</dd>
                      </div>
                      <div>
                        <dt>Source size</dt>
                        <dd>{(asset.size / 1024 / 1024).toFixed(2)} MB</dd>
                      </div>
                    </dl>
                    <span className="eyebrow">
                      SHA-256 / UPLOADED ASSET BYTES
                    </span>
                    <code className="hash">{asset.sha256}</code>
                    <p className="tiny muted">
                      Hash verified on playback. Integrity does not establish
                      authenticity.
                    </p>
                  </div>
                  <div className="panel">
                    <SectionHeading title="Analysis provenance" />
                    {asset.runs.map((r) => (
                      <div className="model-run" key={r.id}>
                        <Badge
                          tone={
                            r.provider === "local-fixture" ? "amber" : "gray"
                          }
                        >
                          {r.provider}
                        </Badge>
                        <strong>{r.model}</strong>
                        <p>{r.routing}</p>
                        <Status status={r.status} />
                        <span className="tiny muted">
                          {r.elapsed_ms} ms ·{" "}
                          {r.provider === "local-fixture"
                            ? "0 provider calls / $0"
                            : "See usage in API"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : activeCase ? (
            <>
              <button className="back-link" onClick={() => setActiveCase(null)}>
                <ArrowLeft size={15} />
                All investigations
              </button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    INVESTIGATION / {activeCase.id.slice(0, 8).toUpperCase()}
                  </div>
                  <h1>{activeCase.title}</h1>
                  <p>{activeCase.description || activeCase.purpose}</p>
                </div>
                <div className="heading-actions">
                  <Badge tone="lime">OPEN INVESTIGATION</Badge>
                  {user.role === "admin" && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        void run(async () => {
                          setUsers(await api<User[]>("/users"));
                          setShareCase(true);
                        })
                      }
                    >
                      <Users size={15} />
                      Share
                    </button>
                  )}
                </div>
              </div>
              <div className="case-summary">
                <div>
                  <span className="eyebrow">AUTHORIZED PURPOSE</span>
                  <p>{activeCase.purpose}</p>
                </div>
                <div>
                  <strong>
                    {activeCase.events.length.toString().padStart(2, "0")}
                  </strong>
                  <span>evidence references</span>
                </div>
                <div>
                  <strong>
                    {activeCase.reports.length.toString().padStart(2, "0")}
                  </strong>
                  <span>report versions</span>
                </div>
                <div>
                  <ShieldCheck size={24} />
                  <span>
                    Source linked
                    <br />
                    {latest?.status === "approved"
                      ? "Human reviewed"
                      : "Review required"}
                  </span>
                </div>
              </div>
              <DiscoveryPanel
                caseId={activeCase.id}
                incident={activeCase.description}
                canWrite={canWrite}
                onChanged={() => {
                  void updateCase();
                }}
                onOpen={(id, time) => {
                  void openAsset(id, time);
                }}
              />
              <CaseIntelligence
                caseId={activeCase.id}
                canWrite={canWrite}
                onOpen={(id, time) => {
                  void openAsset(id, time);
                }}
              />
              <EpisodeTimeline
                caseId={activeCase.id}
                onOpen={(id, time) => {
                  void openAsset(id, time);
                }}
              />
              <ComparisonPanel
                caseId={activeCase.id}
                canWrite={canWrite}
                onChanged={() => {
                  void updateCase();
                }}
              />
              <div className="tabs">
                <button
                  className={caseTab === "timeline" ? "selected" : ""}
                  onClick={() => setCaseTab("timeline")}
                >
                  <Clock3 size={16} />
                  Evidence timeline
                </button>
                <button
                  className={caseTab === "assistant" ? "selected" : ""}
                  onClick={() => setCaseTab("assistant")}
                >
                  <Sparkles size={16} />
                  Investigation assistant
                </button>
                <button
                  className={caseTab === "report" ? "selected" : ""}
                  onClick={() => setCaseTab("report")}
                >
                  <FileText size={16} />
                  Report & review
                  {latest && (
                    <span className="tab-count">v{latest.version}</span>
                  )}
                </button>
              </div>
              {caseTab === "timeline" && (
                <div className="panel case-timeline">
                  <SectionHeading
                    title="Build a picture from the evidence"
                    sub="Grouped by recording. Cross-recording time order is unknown."
                    action={
                      canWrite && (
                        <button
                          className="button secondary"
                          onClick={() => {
                            setActiveCase(null);
                            setPage("events");
                          }}
                        >
                          <Plus size={15} />
                          Find evidence
                        </button>
                      )
                    }
                  />
                  {activeCase.events.length ? (
                    <>
                      {evidenceRows(activeCase.events, false)}
                      <div className="notice-box">
                        <CircleHelp size={16} />
                        <p>{activeCase.time_policy}</p>
                      </div>
                    </>
                  ) : (
                    <Empty
                      icon={FolderOpen}
                      title="Every investigation starts with evidence"
                      text="Search indexed events, then add relevant observations to this investigation."
                      action={
                        <button
                          className="button primary"
                          onClick={() => {
                            setActiveCase(null);
                            setPage("events");
                          }}
                        >
                          Find evidence
                          <ArrowRight size={15} />
                        </button>
                      }
                    />
                  )}
                </div>
              )}
              {caseTab === "assistant" && (
                <div className="assistant-layout">
                  <div className="panel assistant-panel">
                    <div className="assistant-intro">
                      <span className="assistant-orb">
                        <Sparkles size={24} />
                      </span>
                      <Badge tone="lime">EVIDENCE FIRST</Badge>
                      <h2>
                        Connect the dots.
                        <br />
                        Keep the context.
                      </h2>
                      <p>
                        Ask about the selected evidence. Every observation links
                        back to its source.
                      </p>
                    </div>
                    {!answer && (
                      <div className="suggestion-grid">
                        {[
                          "Summarize the selected evidence",
                          "Show the activity timeline",
                          "What remains uncertain?",
                        ].map((q) => (
                          <button key={q} onClick={() => setQuestion(q)}>
                            {q}
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                    )}
                    {answer && (
                      <div className="assistant-answer">
                        <span className="eyebrow">
                          {answer.mode === "local_evidence_assembler"
                            ? "LOCAL EVIDENCE ASSEMBLY · NO MODEL CALLED"
                            : "META STANDARD · EVIDENCE-GROUNDED RESPONSE"}
                        </span>
                        {answer.claims.map((c, i) => (
                          <div className="claim" key={i}>
                            <Badge
                              tone={
                                c.category === "inferred" ? "amber" : "gray"
                              }
                            >
                              {c.category}
                            </Badge>
                            <p>{c.text}</p>
                            <div className="claim-citations">
                              {c.evidence_ids.map((id) => {
                                const source = answer.sources.find(
                                  (e) => e.id === id,
                                );
                                return (
                                  source && (
                                    <button
                                      key={id}
                                      onClick={() =>
                                        void openAsset(
                                          source.asset_id,
                                          source.start,
                                        )
                                      }
                                    >
                                      <Video size={12} />
                                      {source.camera} · {timecode(source.start)}
                                      <ArrowUpRight size={12} />
                                    </button>
                                  )
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <div className="notice-box">
                          <CircleHelp size={16} />
                          <p>{answer.uncertainty}</p>
                        </div>
                      </div>
                    )}
                    <label>
                      Answer mode
                      <select
                        value={assistantMode}
                        onChange={(e) => setAssistantMode(e.target.value)}
                      >
                        <option value="local">Stored evidence only</option>
                        <option value="spark">
                          Muse Spark explanation of retrieved evidence
                        </option>
                      </select>
                    </label>
                    {assistantMode === "spark" && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={assistantConsent}
                          onChange={(e) =>
                            setAssistantConsent(e.target.checked)
                          }
                        />
                        Authorize sending retrieved evidence text to Meta
                        Standard; charges may apply.
                      </label>
                    )}
                    <form
                      className="assistant-input"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          setAnswer(
                            await api<AssistantAnswer>(
                              `/cases/${activeCase.id}/assistant`,
                              post({
                                question,
                                mode: assistantMode,
                                authorize_external_processing: assistantConsent,
                              }),
                            ),
                          );
                          setQuestion("");
                        });
                      }}
                    >
                      <input
                        aria-label="Ask about this investigation"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="Ask a question about the evidence…"
                        minLength={3}
                        maxLength={1500}
                        required
                      />
                      <button disabled={busy} aria-label="Ask question">
                        {busy ? (
                          <Loader2 className="spin" size={17} />
                        ) : (
                          <ArrowUpRight size={18} />
                        )}
                      </button>
                    </form>
                    <p className="tiny muted center">
                      Local mode assembles existing evidence. It does not infer
                      identity or intent.
                    </p>
                  </div>
                  <div className="panel assistant-sources">
                    <SectionHeading title="Evidence in context" />
                    <strong className="source-count">
                      {activeCase.events.length}
                      <span>selected events</span>
                    </strong>
                    <p className="small muted">
                      Only evidence attached to this investigation is available
                      to the assistant.
                    </p>
                    {activeCase.events.slice(0, 6).map((e) => (
                      <button
                        className="mini-source"
                        key={e.id}
                        onClick={() => openEvidence(e)}
                      >
                        <Video size={15} />
                        <span>
                          {e.title}
                          <small>
                            {e.camera} · {timecode(e.start)}
                          </small>
                        </span>
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {caseTab === "report" && (
                <div className="report-layout">
                  <div className="panel report-panel">
                    <SectionHeading
                      title="Investigation report"
                      sub="Evidence, interpretation, and human conclusions, clearly separated."
                      action={
                        canWrite && (
                          <button
                            className="button primary"
                            disabled={busy || !activeCase.events.length}
                            onClick={() =>
                              void run(async () => {
                                await api(
                                  `/cases/${activeCase.id}/reports`,
                                  post({}),
                                );
                                await updateCase();
                                notify(
                                  "A new report snapshot has been created",
                                );
                              })
                            }
                          >
                            <FileText size={15} />
                            {latest ? "New snapshot" : "Generate report"}
                          </button>
                        )
                      }
                    />
                    {latest ? (
                      <>
                        <div className="report-banner">
                          <span>
                            <FileText size={19} />
                            REPORT v{latest.version}
                            <small>
                              {new Date(latest.created).toLocaleString()}
                            </small>
                          </span>
                          <Status status={latest.status} />
                        </div>
                        <div className="report-section">
                          <span className="eyebrow">
                            01 / SCOPE & METHODOLOGY
                          </span>
                          <p>{latest.content.scope || activeCase.purpose}</p>
                          <p className="muted small">
                            {latest.content.methodology}
                          </p>
                        </div>
                        <div className="report-section">
                          <span className="eyebrow">
                            02 / OBSERVED EVIDENCE
                          </span>
                          {latest.content.observations.map((e) => (
                            <p key={e.id}>
                              <button
                                className="inline-citation"
                                onClick={() => openEvidence(e)}
                              >
                                [{timecode(e.start)} · {e.camera}]
                              </button>{" "}
                              {e.title}. {e.description}
                            </p>
                          ))}
                        </div>
                        <div className="report-section">
                          <span className="eyebrow amber-text">
                            03 / MACHINE OR RULE INTERPRETATION
                          </span>
                          {latest.content.interpretations.map((e) => (
                            <p key={e.id}>
                              <button
                                className="inline-citation"
                                onClick={() => openEvidence(e)}
                              >
                                [{timecode(e.start)} · {e.camera}]
                              </button>{" "}
                              {e.title}. {e.description}
                            </p>
                          ))}
                        </div>
                        <div className="report-section">
                          <span className="eyebrow">
                            POSSIBLE HYPOTHESES - UNVERIFIED
                          </span>
                          {(latest.content.possible_hypotheses || []).map(
                            (n) => (
                              <p key={n.id}>
                                {n.label}.{" "}
                                {String(
                                  n.data.uncertainty ||
                                    n.data.reason ||
                                    "Unresolved association; not a verified identity or action.",
                                )}
                              </p>
                            ),
                          )}
                          {!latest.content.possible_hypotheses?.length && (
                            <p>
                              No graph-supported hypothesis included in this
                              snapshot.
                            </p>
                          )}
                        </div>
                        <div className="report-section">
                          <span className="eyebrow">
                            CONTRADICTORY EVIDENCE
                          </span>
                          {(latest.content.contradictory_evidence || []).map(
                            (n) => (
                              <p key={n.id}>{n.label}</p>
                            ),
                          )}
                          {!latest.content.contradictory_evidence?.length && (
                            <p>
                              No structured contradiction recorded in this
                              snapshot. This does not verify agreement or
                              completeness.
                            </p>
                          )}
                          <span className="eyebrow">MISSING EVIDENCE</span>
                          {(
                            latest.content.missing_evidence || [
                              latest.content.uncertainty,
                            ]
                          ).map((s, i) => (
                            <p key={i}>{s}</p>
                          ))}
                        </div>
                        <div className="report-section">
                          <span className="eyebrow">
                            CHRONOLOGICAL TIMELINE
                          </span>
                          {latest.content.timeline.map((e) => (
                            <p key={e.id}>
                              <button
                                className="inline-citation"
                                onClick={() => openEvidence(e)}
                              >
                                {e.camera_timestamp || e.camera} /{" "}
                                {e.start.toFixed(3)}s
                              </button>{" "}
                              {e.title}
                            </p>
                          ))}
                        </div>
                        <div className="report-section">
                          <span className="eyebrow">04 / HUMAN CONCLUSION</span>
                          <p>
                            {latest.content.human_conclusion ||
                              "No human conclusion recorded. Awaiting authorized review."}
                          </p>
                        </div>
                        <div className="report-section">
                          <span className="eyebrow">
                            05 / UNCERTAINTY & LIMITATIONS
                          </span>
                          <p className="muted">{latest.content.uncertainty}</p>
                          <p className="small muted">
                            {latest.content.limitations}
                          </p>
                        </div>
                        <div className="report-section">
                          <span className="eyebrow">
                            06 / EVIDENCE INTEGRITY
                          </span>
                          {latest.content.integrity.map((s) => (
                            <div key={s.asset_id} className="report-hash">
                              <strong>
                                {s.name}
                                {s.synthetic && (
                                  <Badge tone="amber">SYNTHETIC</Badge>
                                )}
                              </strong>
                              <code className="hash">{s.sha256}</code>
                            </div>
                          ))}
                        </div>
                        {latest.notes && (
                          <div className="notice-box">
                            <FileCheck2 size={16} />
                            <p>Reviewer notes: {latest.notes}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <Empty
                        icon={FileText}
                        title="Ready when the evidence is"
                        text="Generate a versioned report from your selected evidence. A human reviewer makes the final decision."
                      />
                    )}
                  </div>
                  <div className="analysis-side">
                    <div className="panel">
                      <SectionHeading title="Human review" />
                      <p className="small muted">
                        Review the source evidence, record your conclusion, and
                        approve or reject a new report version.
                      </p>
                      <button
                        className="button primary full"
                        disabled={!latest || !canReview || busy}
                        title={
                          !canReview
                            ? "Reviewer or administrator role required"
                            : ""
                        }
                        onClick={() => latest && setReviewing(latest)}
                      >
                        <ShieldCheck size={15} />
                        Review report
                      </button>
                      <p className="tiny muted">
                        Every review creates an attributed, immutable snapshot.
                      </p>
                      {latest && (
                        <>
                          <a
                            className="button secondary full"
                            href={`/api/reports/${latest.id}/portable/summary`}
                            download
                          >
                            <ArrowDownToLine size={15} />
                            Download portable summary
                          </a>
                          <a
                            className="button secondary full"
                            href={`/api/reports/${latest.id}/portable/appendix`}
                            download
                          >
                            Download technical appendix
                          </a>
                        </>
                      )}
                    </div>
                    <div className="panel">
                      <SectionHeading title="Version history" />
                      {activeCase.reports.map((r) => (
                        <div className="version-row" key={r.id}>
                          <span className="version-number">v{r.version}</span>
                          <div>
                            <Status status={r.status} />
                            <small>
                              {new Date(r.created).toLocaleString()}
                            </small>
                          </div>
                          <a
                            href={`/api/reports/${r.id}/portable/json`}
                            className="icon-button"
                            aria-label={`Export report version ${r.version}`}
                          >
                            <ArrowDownToLine size={15} />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {page === "overview" && (
                <>
                  <div className="page-heading overview-heading">
                    <div>
                      <div className="eyebrow">
                        <span className="mini-line" />
                        YOUR OPERATIONS, IN FOCUS
                      </div>
                      <h1>
                        A clearer view. <span>A smarter response.</span>
                      </h1>
                      <p>
                        Turn everyday footage into understanding. Everything you
                        need, in one place.
                      </p>
                    </div>
                    <div className="heading-actions">
                      <button
                        className="button secondary"
                        onClick={() => setModal("case")}
                        disabled={!canWrite}
                      >
                        <Plus size={16} />
                        New investigation
                      </button>
                      <button
                        className="button primary"
                        onClick={() => setModal("upload")}
                        disabled={!canWrite}
                      >
                        <Upload size={15} />
                        Upload video
                      </button>
                    </div>
                  </div>
                  <div className="environment-strip">
                    <div>
                      <span className="environment-dot" />
                      <strong>Warehouse workspace</strong>
                      <span className="environment-separator">/</span>
                      <span>Recorded video intelligence</span>
                    </div>
                    <Badge tone="lime">
                      <span className="tiny-dot" />
                      {settings?.provider_status === "fixture_mode"
                        ? "LOCAL FIXTURE MODE"
                        : "META STANDARD · CONFIGURED"}
                    </Badge>
                  </div>
                  <div className="stats-grid">
                    {[
                      {
                        label: "Video recordings",
                        value: dash.assets,
                        icon: Video,
                        caption: `${dash.processing} currently processing`,
                        cls: "lime",
                        bars: [3, 7, 4, 8, 5, 10, 7, 12],
                      },
                      {
                        label: "Observable events",
                        value: dash.events,
                        icon: ScanLine,
                        caption: "Source-linked & searchable",
                        cls: "sage",
                        bars: [4, 3, 6, 4, 8, 5, 10, 8],
                      },
                      {
                        label: "Open investigations",
                        value: dash.cases,
                        icon: FolderOpen,
                        caption: "Evidence-led case management",
                        cls: "blue",
                        bars: [2, 5, 5, 4, 7, 7, 9, 9],
                      },
                      {
                        label: "Alerts to review",
                        value: dash.alerts,
                        icon: Bell,
                        caption: "Human attention, where it matters",
                        cls: "amber",
                        bars: [8, 6, 5, 7, 4, 3, 5, 3],
                      },
                    ].map((s) => (
                      <div className={`stat-card ${s.cls}`} key={s.label}>
                        <div className="stat-top">
                          <span>{s.label}</span>
                          <s.icon size={17} strokeWidth={1.5} />
                        </div>
                        <div className="stat-value">
                          <strong>{String(s.value).padStart(2, "0")}</strong>
                          <span className="stat-icon-watermark">
                            <s.icon size={38} strokeWidth={0.75} />
                          </span>
                        </div>
                        <div className="stat-caption">
                          <span className="tiny-dot" />
                          {s.caption}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="overview-columns">
                    <div className="overview-primary">
                      <div className="panel camera-panel">
                        <SectionHeading
                          title="Your eyes on the floor"
                          sub="Recent recordings from your workspace."
                          action={
                            <button
                              className="text-button"
                              onClick={() => navigate("library")}
                            >
                              Video library
                              <ArrowUpRight size={15} />
                            </button>
                          }
                        />
                        {dash.recordings.length ? (
                          <div className="recording-grid">
                            {dash.recordings.map(recordingCard)}
                          </div>
                        ) : (
                          <Empty
                            icon={Camera}
                            title="Your first recording is a starting point"
                            text="Upload authorized footage or explore four clearly labeled synthetic warehouse recordings."
                            action={
                              <button
                                className="button primary"
                                disabled={busy || demoLoading || !canWrite}
                                onClick={() => void loadDemo()}
                              >
                                {demoLoading ? (
                                  <Loader2 className="spin" size={16} />
                                ) : (
                                  <WandSparkles size={16} />
                                )}
                                {demoLoading
                                  ? "Generating demo recordings…"
                                  : "Load warehouse demo"}
                              </button>
                            }
                          />
                        )}
                        <div className="panel-footnote">
                          <LockKeyhole size={12} />
                          <span>
                            Protected recordings. No live cameras connected.
                          </span>
                          <span>{dash.assets} sources in library</span>
                        </div>
                      </div>
                      <div className="panel recent-panel">
                        <SectionHeading
                          title="The latest signals"
                          sub="Recent observations, with the evidence behind them."
                          action={
                            <button
                              className="text-button"
                              onClick={() => navigate("events")}
                            >
                              Explore events
                              <ArrowUpRight size={15} />
                            </button>
                          }
                        />
                        {dash.recent_events.length ? (
                          evidenceRows(dash.recent_events, false)
                        ) : (
                          <div className="subtle-empty">
                            Your latest indexed events will appear here.
                          </div>
                        )}
                      </div>
                    </div>
                    <aside className="overview-secondary">
                      <div className="insight-card">
                        <div className="insight-heading">
                          <span className="insight-mark">
                            <Sparkles size={20} />
                          </span>
                          <Badge tone="lime">FROM FOOTAGE TO FINDINGS</Badge>
                        </div>
                        <h2>
                          Every frame has
                          <br />a bigger picture.
                        </h2>
                        <p>
                          Bring observations together.
                          <br />
                          Build a timeline. Find the context.
                        </p>
                        <div className="insight-diagram">
                          <div className="diagram-point">
                            <Video size={15} />
                          </div>
                          <span />
                          <div className="diagram-point main">
                            <Crosshair size={24} />
                          </div>
                          <span />
                          <div className="diagram-point">
                            <FileCheck2 size={15} />
                          </div>
                        </div>
                        <button
                          onClick={() => setModal("case")}
                          disabled={!canWrite}
                        >
                          Start an investigation
                          <ArrowUpRight size={17} />
                        </button>
                        <div className="insight-bottom">
                          <ShieldCheck size={12} /> Evidence grounded. Human
                          guided.
                        </div>
                      </div>
                      <div className="panel activity-panel">
                        <SectionHeading
                          title="Event breakdown"
                          action={<Activity size={16} className="muted" />}
                        />
                        <p className="small muted">
                          Indexed evidence by event type
                        </p>
                        <div className="breakdown-total">
                          <strong>
                            {String(dash.events).padStart(2, "0")}
                          </strong>
                          <span>total events</span>
                        </div>
                        <div className="segmented-bar">
                          {dash.distribution.map((d, i) => (
                            <span
                              key={d.type}
                              style={{
                                flex: d.count,
                                background: [
                                  "#c9e995",
                                  "#6f9583",
                                  "#d7b873",
                                  "#728b9a",
                                ][i % 4],
                              }}
                              title={`${humanize(d.type)}: ${d.count}`}
                            />
                          ))}
                        </div>
                        <div className="breakdown-list">
                          {dash.distribution.length ? (
                            dash.distribution.map((d, i) => (
                              <div key={d.type}>
                                <span>
                                  <i
                                    style={{
                                      background: [
                                        "#c9e995",
                                        "#6f9583",
                                        "#d7b873",
                                        "#728b9a",
                                      ][i % 4],
                                    }}
                                  />
                                  {humanize(d.type)}
                                </span>
                                <strong>{d.count}</strong>
                              </div>
                            ))
                          ) : (
                            <p className="small muted">
                              No indexed events yet.
                            </p>
                          )}
                        </div>
                        <div className="activity-disclosure">
                          {dash.recordings.some((a) => a.synthetic)
                            ? "Includes synthetic fixture annotations. No accuracy claims."
                            : "Counts reflect stored event records."}
                        </div>
                      </div>
                      <div className="trust-note">
                        <Fingerprint size={23} strokeWidth={1.1} />
                        <p>
                          Nothing without a source.
                          <span>
                            Evidence integrity is part of every investigation.
                          </span>
                        </p>
                        <ArrowUpRight size={15} />
                      </div>
                    </aside>
                  </div>
                </>
              )}
              {page === "library" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        THE SOURCE OF YOUR UNDERSTANDING
                      </div>
                      <h1>
                        Video library
                        <span className="heading-count">{assets.length}</span>
                      </h1>
                      <p>
                        Your recordings, protected and ready for a closer look.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      disabled={!canWrite}
                      onClick={() => setModal("upload")}
                    >
                      <Upload size={15} />
                      Upload video
                    </button>
                  </div>
                  <div className="toolbar">
                    <div className="input-search">
                      <Search size={16} />
                      <input
                        aria-label="Search recordings"
                        placeholder="Search recordings or locations…"
                        value={libraryQuery}
                        onChange={(e) => setLibraryQuery(e.target.value)}
                      />
                    </div>
                    <span className="toolbar-spacer" />
                    <span className="small muted">
                      {assets.length} recordings
                    </span>
                    <div className="view-toggle">
                      <button
                        aria-label="Grid view"
                        className={libraryLayout === "grid" ? "selected" : ""}
                        onClick={() => setLibraryLayout("grid")}
                      >
                        <Grid2X2 size={16} />
                      </button>
                      <button
                        aria-label="List view"
                        className={libraryLayout === "list" ? "selected" : ""}
                        onClick={() => setLibraryLayout("list")}
                      >
                        <List size={17} />
                      </button>
                    </div>
                  </div>
                  {assets.length ? (
                    <div
                      className={
                        libraryLayout === "grid"
                          ? "library-grid"
                          : "library-list"
                      }
                    >
                      {assets
                        .filter((a) =>
                          `${a.name} ${a.camera}`
                            .toLowerCase()
                            .includes(libraryQuery.toLowerCase()),
                        )
                        .map((a) => (
                          <div className="library-card-wrap" key={a.id}>
                            {recordingCard(a)}
                            {canWrite && (
                              <button
                                className="delete-recording icon-button"
                                aria-label={`Delete ${a.name}`}
                                title="Delete recording and derived artifacts"
                                onClick={() => setDeleteTarget(a.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="panel">
                      <Empty
                        title="A new perspective starts with a recording"
                        text="Supported: MP4 and WebM, up to 100 MB, 120 seconds, and 1080p."
                        action={
                          <button
                            className="button primary"
                            onClick={() => setModal("upload")}
                          >
                            Upload your first video
                            <Upload size={15} />
                          </button>
                        }
                      />
                    </div>
                  )}
                  <div className="notice-box library-notice">
                    <ShieldCheck size={17} />
                    <p>
                      Original files remain unchanged. Source hashes, derived
                      frames, and processing history are retained with each
                      recording.
                    </p>
                  </div>
                </>
              )}
              {page === "events" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        FIND THE MOMENT THAT MATTERS
                      </div>
                      <h1>Search the evidence.</h1>
                      <p>
                        Explore observable activity. Follow every result back to
                        its source.
                      </p>
                    </div>
                    <Badge tone="lime">
                      <Database size={12} />
                      {dash.events} INDEXED EVENTS
                    </Badge>
                  </div>
                  <div className="panel search-panel">
                    <form
                      className="evidence-search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        setSearch(query);
                      }}
                    >
                      <Search size={22} />
                      <input
                        aria-label="Search indexed events"
                        placeholder="Try “person near the exit” or “restricted zone”…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        maxLength={300}
                      />
                      <button className="button primary" type="submit">
                        Search evidence
                        <ArrowRight size={16} />
                      </button>
                    </form>
                    <div className="search-filters">
                      <span>
                        <SlidersHorizontal size={14} />
                        Refine by
                      </span>
                      <select
                        aria-label="Filter by camera"
                        value={camera}
                        onChange={(e) => setCamera(e.target.value)}
                      >
                        <option value="">All sources</option>
                        {Array.from(new Set(assets.map((a) => a.camera))).map(
                          (c) => (
                            <option key={c}>{c}</option>
                          ),
                        )}
                      </select>
                      <select
                        aria-label="Filter by event type"
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value)}
                      >
                        <option value="">All event types</option>
                        {[
                          "person_presence",
                          "movement",
                          "zone_entry",
                          "scene_analysis",
                        ].map((t) => (
                          <option value={t} key={t}>
                            {humanize(t)}
                          </option>
                        ))}
                      </select>
                      <div className="time-filter">
                        <Clock3 size={13} />
                        <input
                          aria-label="Start seconds"
                          type="number"
                          min="0"
                          max="28800"
                          placeholder="Start s"
                          value={range.start}
                          onChange={(e) =>
                            setRange({ ...range, start: e.target.value })
                          }
                        />
                        <span>—</span>
                        <input
                          aria-label="End seconds"
                          type="number"
                          min="0"
                          max="28800"
                          placeholder="End s"
                          value={range.end}
                          onChange={(e) =>
                            setRange({ ...range, end: e.target.value })
                          }
                        />
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setQuery("");
                          setSearch("");
                          setCamera("");
                          setEventType("");
                          setRange({ start: "", end: "" });
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="results-heading">
                    <h2>
                      {results.length} <span>matching events</span>
                    </h2>
                    <span className="small muted">
                      Source-relative timestamps · deterministic matching
                    </span>
                  </div>
                  {search && (
                    <div className="interpreted-filters">
                      <span>INTERPRETED FILTERS</span>
                      <code>{JSON.stringify(filters)}</code>
                    </div>
                  )}
                  {results.length ? (
                    <div className="panel event-results">
                      {results.map((e) => (
                        <div className="search-result" key={e.id}>
                          <button
                            className="result-thumb"
                            onClick={() => openEvidence(e)}
                          >
                            <img
                              alt={`Derived navigation preview for ${e.title}`}
                              title="Historical preview with unverified source lineage. Use the evidence graph for a source-bound frame."
                              src={`/api/videos/${e.asset_id}/thumbnail?at=${e.start}`}
                            />
                            <span className="mono">
                              <Video size={11} />
                              {timecode(e.start)}
                            </span>
                          </button>
                          <div className="result-copy">
                            <div className="result-labels">
                              <Badge
                                tone={
                                  e.category === "inferred" ? "amber" : "gray"
                                }
                              >
                                {e.category}
                              </Badge>
                              <span>{humanize(e.type)}</span>
                              {e.synthetic && (
                                <span className="fixture-label">
                                  SYNTHETIC FIXTURE
                                </span>
                              )}
                            </div>
                            <button
                              className="result-title"
                              onClick={() => openEvidence(e)}
                            >
                              {e.title}
                              <ArrowUpRight size={15} />
                            </button>
                            <p>{e.description}</p>
                            <span className="result-source">
                              <Video size={12} />
                              {e.camera}
                              <span className="separator">·</span>Source{" "}
                              {e.asset_id.slice(0, 8)}
                            </span>
                          </div>
                          {canWrite && (
                            <button
                              className="button secondary"
                              onClick={() => setAddEvidence(e)}
                            >
                              <Plus size={14} />
                              Add to case
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="panel">
                      <Empty
                        icon={Search}
                        title="No matching evidence"
                        text="Try fewer terms or a wider time window. SENSA only returns events that have been indexed."
                      />
                    </div>
                  )}
                </>
              )}
              {page === "investigations" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        FROM OBSERVATIONS TO UNDERSTANDING
                      </div>
                      <h1>
                        Investigations
                        <span className="heading-count">{cases.length}</span>
                      </h1>
                      <p>
                        Connect the evidence. Record the uncertainty. Keep the
                        human in the loop.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      disabled={!canWrite}
                      onClick={() => setModal("case")}
                    >
                      <Plus size={16} />
                      New investigation
                    </button>
                  </div>
                  {cases.length ? (
                    <div className="case-grid">
                      {cases.map((c) => (
                        <button
                          className="case-card panel"
                          key={c.id}
                          onClick={() => void openCase(c.id)}
                        >
                          <div className="case-card-top">
                            <span className="case-icon">
                              <FolderOpen size={23} strokeWidth={1.4} />
                            </span>
                            <Badge tone="lime">{c.status}</Badge>
                            <ArrowUpRight size={17} />
                          </div>
                          <span className="eyebrow">
                            CASE / {c.id.slice(0, 8).toUpperCase()}
                          </span>
                          <h2>{c.title}</h2>
                          <p>{c.description || c.purpose}</p>
                          <div className="case-card-footer">
                            <span>
                              <FileText size={13} />
                              {c.evidence_count} evidence references
                            </span>
                            <span>
                              {new Date(c.created).toLocaleDateString()}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="panel">
                      <Empty
                        icon={FolderOpen}
                        title="A story waiting for context"
                        text="Create an investigation, add relevant events, and build an evidence-linked timeline."
                        action={
                          <button
                            className="button primary"
                            onClick={() => setModal("case")}
                          >
                            <Plus size={15} />
                            Create investigation
                          </button>
                        }
                      />
                    </div>
                  )}
                </>
              )}
              {page === "alerts" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">
                        THE SIGNAL, WITH THE CONTEXT
                      </div>
                      <h1>
                        Alerts
                        <span className="heading-count">{dash.alerts}</span>
                      </h1>
                      <p>
                        Rule-triggered observations for human attention. An
                        alert is a prompt to review.
                      </p>
                    </div>
                    <Badge tone="amber">{dash.alerts} AWAITING REVIEW</Badge>
                  </div>
                  <div className="panel alerts-panel">
                    <SectionHeading
                      title="Review queue"
                      sub="Restricted-zone rule v1 · normalized pixel coordinates · fixture sources clearly labeled."
                    />
                    {alerts.length ? (
                      alerts.map((a) => (
                        <div className="alert-row" key={a.id}>
                          <span className="event-symbol amber">
                            <AlertTriangle size={20} />
                          </span>
                          <div className="alert-body">
                            <div>
                              <strong>{a.event.title}</strong>
                              <Badge tone="amber">{a.event.severity}</Badge>
                              <Status status={a.status} />
                            </div>
                            <p>{a.event.description}</p>
                            <button
                              className="inline-citation"
                              onClick={() =>
                                void openAsset(a.event.asset_id, a.event.start)
                              }
                            >
                              <Video size={12} />
                              {a.event.camera} · {timecode(a.event.start)}
                              {a.event.synthetic ? " · synthetic fixture" : ""}
                              <ArrowUpRight size={12} />
                            </button>
                            {a.reason && (
                              <p className="tiny muted">
                                Review note: {a.reason}
                              </p>
                            )}
                          </div>
                          {canWrite && (
                            <div className="alert-actions">
                              <button
                                className="button secondary"
                                onClick={() =>
                                  setFeedback({
                                    id: a.id,
                                    status: "acknowledged",
                                  })
                                }
                              >
                                <Check size={14} />
                                Acknowledge
                              </button>
                              <button
                                className="text-button"
                                onClick={() =>
                                  setFeedback({ id: a.id, status: "dismissed" })
                                }
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <Empty
                        icon={CheckCheck}
                        title="Nothing awaiting your attention"
                        text="Alerts appear here when configured event rules produce reviewable observations."
                      />
                    )}
                  </div>
                </>
              )}
              {page === "settings" && settings && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">BUILT FOR YOUR WORKSPACE</div>
                      <h1>Settings & system</h1>
                      <p>
                        Know what is connected, what is configured, and what is
                        running.
                      </p>
                    </div>
                    <Badge tone="lime">
                      <ShieldCheck size={12} />
                      STANDARD PRIVACY MODE
                    </Badge>
                  </div>
                  {user.role === "admin" && <OperationsPanel />}
                  <div className="settings-grid">
                    <div className="panel">
                      <SectionHeading
                        title="Model providers"
                        sub="Credentials are managed on the server and never sent to your browser."
                        action={<Sparkles size={19} className="accent-text" />}
                      />
                      <div className="notice-box">
                        <CircleHelp size={16} />
                        <p>
                          {settings.provider_status === "fixture_mode"
                            ? "Meta credentials are not configured. Synthetic footage uses exact animation annotations. No genuine AI inference has run."
                            : "Credentials are configured. Catalogue access and individual inference success must still be verified."}
                        </p>
                      </div>
                      {settings.models.map((m) => (
                        <div className="provider-row" key={m.id}>
                          <span className="model-icon">
                            <Crosshair size={19} />
                          </span>
                          <div>
                            <strong>{m.id}</strong>
                            <p>{m.purpose}</p>
                          </div>
                          <Badge tone="gray">{humanize(m.status)}</Badge>
                        </div>
                      ))}
                      {user.role === "admin" && (
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const r = await api<{
                                status: string;
                                notice: string;
                              }>("/providers/check", post({}));
                              notify(`${r.status}: ${r.notice}`);
                            })
                          }
                        >
                          <Activity size={14} />
                          Check Meta catalogue
                        </button>
                      )}
                      <p className="tiny muted">
                        Optional audio transcription and image generation are
                        not enabled.
                      </p>
                    </div>
                    <div className="panel">
                      <SectionHeading
                        title="Processing limits"
                        action={
                          <SlidersHorizontal size={17} className="muted" />
                        }
                      />
                      <dl className="metadata settings-metadata">
                        {Object.entries(settings.limits).map(([k, v]) => (
                          <div key={k}>
                            <dt>{humanize(k)}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="tiny muted">
                        Set environment variables on the server and restart to
                        change supported limits.
                      </p>
                    </div>
                    <div className="panel">
                      <SectionHeading
                        title="Data & evidence"
                        action={<Database size={18} className="muted" />}
                      />
                      <div className="settings-info">
                        <span>Retention</span>
                        <p>{settings.retention}</p>
                      </div>
                      <div className="settings-info">
                        <span>Camera connectivity</span>
                        <p>{settings.live_cameras}</p>
                      </div>
                      <div className="settings-info">
                        <span>Spatial calibration</span>
                        <p>{settings.calibration}</p>
                      </div>
                    </div>
                    <div className="panel">
                      <SectionHeading
                        title="Workspace access"
                        action={
                          user.role === "admin" && (
                            <button
                              className="text-button"
                              onClick={() => setModal("user")}
                            >
                              <Plus size={14} />
                              Add user
                            </button>
                          )
                        }
                      />
                      <div className="access-person">
                        <span className="avatar">{user.name[0]}</span>
                        <div>
                          <strong>{user.name}</strong>
                          <p>{user.email}</p>
                        </div>
                        <Badge tone="lime">{user.role}</Badge>
                      </div>
                      <p className="small muted">
                        Investigations are private to their owner and explicitly
                        shared members. Administrators can access this local
                        workspace. Viewers cannot modify evidence or reports.
                      </p>
                      {user.role === "admin" && (
                        <button
                          className="button secondary"
                          onClick={() =>
                            void run(async () => {
                              const rows = await api<User[]>("/users");
                              setUsers(rows);
                              notify(
                                `${rows.length} workspace account${rows.length === 1 ? "" : "s"} loaded`,
                              );
                            })
                          }
                        >
                          <Users size={14} />
                          View workspace users
                        </button>
                      )}
                      {users.map((u) => (
                        <div className="user-list-row" key={u.id}>
                          <span>{u.email}</span>
                          <Badge tone="gray">{u.role}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {page === "audit" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">A RECORD OF WHAT HAPPENED</div>
                      <h1>Audit trail</h1>
                      <p>
                        Access, analysis, decisions, and exports. Traceable in a
                        local SHA-256 chain.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const r = await api<{
                            valid: boolean;
                            checked: number;
                          }>("/audit/verify");
                          notify(
                            r.valid
                              ? `Audit chain verified: ${r.checked} linked records`
                              : "Audit chain validation failed",
                            !r.valid,
                          );
                          setAudit(await api<AuditItem[]>("/audit"));
                        })
                      }
                    >
                      <Fingerprint size={15} />
                      Verify audit chain
                    </button>
                  </div>
                  <div className="panel audit-panel">
                    <div className="audit-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>SEQUENCE</th>
                            <th>ACTION</th>
                            <th>REFERENCE</th>
                            <th>RECORDED AT</th>
                            <th>INTEGRITY HASH</th>
                          </tr>
                        </thead>
                        <tbody>
                          {audit.map((a) => (
                            <tr key={a.seq}>
                              <td className="mono">
                                #{String(a.seq).padStart(4, "0")}
                              </td>
                              <td>
                                <span className="audit-action">
                                  <span className="tiny-dot" />
                                  {a.action}
                                </span>
                              </td>
                              <td className="mono muted">
                                {a.target ? a.target.slice(0, 20) : "—"}
                              </td>
                              <td className="muted">
                                {new Date(a.created).toLocaleString()}
                              </td>
                              <td className="mono hash-cell" title={a.hash}>
                                {a.hash.slice(0, 14)}…<ShieldCheck size={13} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="panel-footnote">
                      <Fingerprint size={13} />A local hash chain supports
                      traceability. It is not external notarization or proof of
                      legal admissibility.
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="footer-logo">sensa.</span> CAMERAS THAT
              UNDERSTAND
            </span>
            <span>
              Evidence first.<span className="separator">/</span>Human judgment
              always.
              <ShieldCheck size={12} />
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className={`toast ${notice.error ? "error" : ""}`} role="status">
          {notice.error ? <AlertTriangle size={17} /> : <Check size={17} />}
          {notice.text}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {(modal ||
        feedback ||
        deleteTarget ||
        addEvidence ||
        reviewing ||
        shareCase) && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setModal(null);
              setFeedback(null);
              setDeleteTarget(null);
              setAddEvidence(null);
              setReviewing(null);
              setShareCase(false);
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "upload"
                ? "Upload recording"
                : modal === "case"
                  ? "Create investigation"
                  : "Workspace action"
            }
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => {
                setModal(null);
                setFeedback(null);
                setDeleteTarget(null);
                setAddEvidence(null);
                setReviewing(null);
                setShareCase(false);
              }}
              disabled={busy}
            >
              <X size={20} />
            </button>
            {modal === "upload" && (
              <>
                <span className="modal-symbol">
                  <Upload size={25} />
                </span>
                <h2>Bring your footage into focus.</h2>
                <p>Upload a recording you are authorized to process.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      const result = await api<{
                        items: {
                          name: string;
                          status: string;
                          reason?: string;
                        }[];
                        accepted: number;
                      }>("/videos/batch", { method: "POST", body: f });
                      if (result.items.some((x) => x.status === "failed"))
                        notify(
                          result.items
                            .filter((x) => x.status === "failed")
                            .map((x) => x.name + ": " + x.reason)
                            .join("; "),
                        );
                      await refresh();
                      setModal(null);
                      navigate("library");
                      notify(
                        "Recording uploaded. Frame processing has started.",
                      );
                    });
                  }}
                >
                  <label className="upload-drop">
                    <span>
                      <Upload size={30} strokeWidth={1.2} />
                    </span>
                    <strong>Choose recordings</strong>
                    <p>
                      MP4 or WebM · up to 2 GB · 8 hours · 4K (frame/resource
                      limits apply)
                    </p>
                    <input
                      type="file"
                      name="files"
                      multiple
                      accept="video/mp4,video/webm"
                      required
                      aria-label="Choose video recording"
                    />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" required />I have permission to
                    process this recording.
                  </label>
                  <div className="notice-box">
                    <LockKeyhole size={16} />
                    <p>
                      The original is stored privately. Uploading runs local
                      decoding; external AI processing requires a separate
                      authorization.
                    </p>
                  </div>
                  <button className="button primary full" disabled={busy}>
                    {busy ? (
                      <>
                        <Loader2 className="spin" size={16} />
                        Uploading & validating…
                      </>
                    ) : (
                      <>
                        Upload recording
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
            {modal === "case" && (
              <>
                <span className="modal-symbol">
                  <FolderOpen size={25} />
                </span>
                <h2>Start with a question.</h2>
                <p>Create a focused investigation around the evidence.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      const c = await api<Investigation>(
                        "/cases",
                        post({
                          title: f.get("title"),
                          description: f.get("description"),
                          purpose: f.get("purpose"),
                        }),
                      );
                      await refresh();
                      setModal(null);
                      setActiveCase(await api<CaseDetail>(`/cases/${c.id}`));
                      setPage("investigations");
                      setCaseTab("timeline");
                      notify("Investigation created");
                    });
                  }}
                >
                  <label>
                    Investigation title
                    <input
                      name="title"
                      placeholder="Activity near the east exit"
                      minLength={3}
                      maxLength={150}
                      required
                      autoFocus
                    />
                  </label>
                  <label>
                    What are you investigating?
                    <textarea
                      name="description"
                      placeholder="Describe the incident, relevant sources, and what is still unknown."
                      maxLength={3000}
                      rows={3}
                    />
                  </label>
                  <label>
                    Authorized purpose
                    <input
                      name="purpose"
                      placeholder="Authorized warehouse operations review"
                      minLength={3}
                      maxLength={300}
                      required
                    />
                  </label>
                  <button className="button primary full" disabled={busy}>
                    {busy ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <>
                        Create investigation
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
            {modal === "help" && (
              <>
                <span className="modal-symbol">
                  <CircleHelp size={26} />
                </span>
                <h2>A little direction.</h2>
                <p>Your path from footage to a reviewable finding.</p>
                <ol className="help-steps">
                  <li>
                    <strong>Start with a source</strong>
                    <span>
                      Upload an authorized recording or select “Explore the
                      demo” to generate synthetic warehouse footage.
                    </span>
                  </li>
                  <li>
                    <strong>Find the moment</strong>
                    <span>
                      Search indexed events and open their source timestamps.
                      Synthetic annotations are labeled everywhere.
                    </span>
                  </li>
                  <li>
                    <strong>Build the investigation</strong>
                    <span>
                      Create a case, add events, and ask the local evidence
                      assistant for a summary.
                    </span>
                  </li>
                  <li>
                    <strong>Keep the human in the loop</strong>
                    <span>
                      Generate a report, review its wording, and export an
                      attributed version with source hashes.
                    </span>
                  </li>
                </ol>
                <div className="notice-box">
                  <Sparkles size={16} />
                  <p>
                    Meta inference requires a server-side MODEL_API_KEY. Live
                    cameras, automated retention, and metric calibration are not
                    enabled.
                  </p>
                </div>
                <a
                  className="button secondary full"
                  href="http://127.0.0.1:8001/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open local API documentation
                  <ExternalLink size={14} />
                </a>
              </>
            )}
            {modal === "user" && (
              <>
                <span className="modal-symbol">
                  <Users size={25} />
                </span>
                <h2>Invite a perspective.</h2>
                <p>
                  Create a local account, then share specific investigations
                  with it.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      await api("/users", post(Object.fromEntries(f)));
                      setUsers(await api<User[]>("/users"));
                      setModal(null);
                      notify("Workspace account created");
                    });
                  }}
                >
                  <label>
                    Full name
                    <input name="name" required maxLength={80} />
                  </label>
                  <label>
                    Email
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    Initial password
                    <input
                      name="password"
                      type="password"
                      minLength={12}
                      maxLength={128}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    Workspace role
                    <select name="role">
                      <option value="operator">Operator / Analyst</option>
                      <option value="reviewer">Reviewer / Supervisor</option>
                      <option value="viewer">Read-only viewer</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </label>
                  <button className="button primary full" disabled={busy}>
                    Create account
                    <Plus size={15} />
                  </button>
                </form>
              </>
            )}
            {feedback && (
              <>
                <span className="modal-symbol">
                  <FileCheck2 size={25} />
                </span>
                <h2>
                  {feedback.status === "dismissed"
                    ? "Record your decision."
                    : "Acknowledge with context."}
                </h2>
                <p>Operator feedback is preserved in the audit trail.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      await api(`/alerts/${feedback.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          status: feedback.status,
                          reason: f.get("reason"),
                        }),
                      });
                      setFeedback(null);
                      await refresh();
                      notify("Alert review recorded");
                    });
                  }}
                >
                  <label>
                    Review note
                    <textarea
                      name="reason"
                      rows={3}
                      minLength={3}
                      maxLength={500}
                      required
                      autoFocus
                      placeholder="What did you observe when reviewing the source?"
                    />
                  </label>
                  <button className="button primary full" disabled={busy}>
                    Save review
                    <Check size={15} />
                  </button>
                </form>
              </>
            )}
            {deleteTarget && (
              <>
                <span className="modal-symbol danger">
                  <Trash2 size={25} />
                </span>
                <h2>Delete this recording?</h2>
                <p>
                  The original recording, sampled frames, observations, and
                  events will be removed. Investigation-linked evidence cannot
                  be deleted.
                </p>
                <div className="notice-box">
                  <AlertTriangle size={16} />
                  <p>
                    This permanently removes the local source and derived media.
                    Audit metadata is retained.
                  </p>
                </div>
                <button
                  className="button danger-button full"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`/videos/${deleteTarget}`, {
                        method: "DELETE",
                      });
                      setDeleteTarget(null);
                      await refresh();
                      notify("Recording and derived artifacts deleted");
                    })
                  }
                >
                  Delete recording
                  <Trash2 size={15} />
                </button>
              </>
            )}
            {addEvidence && (
              <>
                <span className="modal-symbol">
                  <Plus size={25} />
                </span>
                <h2>A piece of the bigger picture.</h2>
                <p>Add “{addEvidence.title}” to an investigation.</p>
                {cases.length ? (
                  <div className="add-case-list">
                    {cases.map((c) => (
                      <button
                        key={c.id}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              `/cases/${c.id}/evidence`,
                              post({ event_id: addEvidence.id }),
                            );
                            setAddEvidence(null);
                            await refresh();
                            notify(`Evidence added to ${c.title}`);
                          })
                        }
                      >
                        <FolderOpen size={20} />
                        <span>
                          <strong>{c.title}</strong>
                          <small>{c.evidence_count} evidence references</small>
                        </span>
                        <Plus size={17} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="notice-box">
                    <FolderOpen size={17} />
                    <p>
                      Create an investigation first, then return to add this
                      evidence.
                    </p>
                  </div>
                )}
                <button
                  className="button secondary full"
                  onClick={() => {
                    setAddEvidence(null);
                    setModal("case");
                  }}
                >
                  <Plus size={15} />
                  Create a new investigation
                </button>
              </>
            )}
            {reviewing && (
              <>
                <span className="modal-symbol">
                  <ShieldCheck size={25} />
                </span>
                <h2>Your judgment. On the record.</h2>
                <p>
                  Review version {reviewing.version}. Saving creates a new
                  attributed version.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(async () => {
                      await api(
                        `/reports/${reviewing.id}/review`,
                        post({
                          expected_version: reviewing.version,
                          status: f.get("status"),
                          notes: f.get("notes"),
                          human_conclusion: f.get("human_conclusion"),
                        }),
                      );
                      setReviewing(null);
                      await updateCase();
                      notify("Report review saved as a new version");
                    });
                  }}
                >
                  <label>
                    Human conclusion
                    <textarea
                      name="human_conclusion"
                      rows={4}
                      maxLength={5000}
                      defaultValue={reviewing.content.human_conclusion}
                      placeholder="State only conclusions supported by the evidence. Record uncertainty."
                    />
                  </label>
                  <label>
                    Reviewer notes
                    <textarea
                      name="notes"
                      minLength={1}
                      maxLength={3000}
                      rows={2}
                      required
                      placeholder="What did you verify or correct?"
                    />
                  </label>
                  <label>
                    Review decision
                    <select name="status">
                      <option value="draft">Save revised draft</option>
                      <option value="approved">Approve report</option>
                      <option value="rejected">Reject report</option>
                    </select>
                  </label>
                  <button className="button primary full" disabled={busy}>
                    Record review
                    <Check size={15} />
                  </button>
                </form>
              </>
            )}
            {shareCase && activeCase && (
              <>
                <span className="modal-symbol">
                  <Users size={25} />
                </span>
                <h2>Share the context.</h2>
                <p>
                  Grant a workspace account access to this investigation and its
                  source recordings.
                </p>
                <div className="add-case-list">
                  {users
                    .filter((u) => u.id !== user.id)
                    .map((u) => (
                      <button
                        key={u.id}
                        disabled={
                          busy || activeCase.members.some((m) => m.id === u.id)
                        }
                        onClick={() =>
                          void run(async () => {
                            await api(
                              `/cases/${activeCase.id}/members`,
                              post({ user_id: u.id }),
                            );
                            await updateCase();
                            notify(`Investigation shared with ${u.name}`);
                          })
                        }
                      >
                        <Users size={18} />
                        <span>
                          <strong>{u.name}</strong>
                          <small>
                            {u.email} · {u.role}
                          </small>
                        </span>
                        {activeCase.members.some((m) => m.id === u.id) ? (
                          <Check size={16} />
                        ) : (
                          <Plus size={16} />
                        )}
                      </button>
                    ))}
                </div>
                {users.length < 2 && (
                  <p>
                    Create another account in Settings to share this
                    investigation.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
