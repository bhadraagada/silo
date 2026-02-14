import { useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark";
type ViewMode = "ops" | "docs";
type OpsStage = "setup" | "run" | "monitor" | "ship";

type Workspace = {
  id: string;
  slug: string;
  projectSlug: string;
  task: string;
  status: string;
  domain: string;
  branch: string;
  updatedAt: string;
};

type Run = {
  id: string;
  workspaceId: string;
  provider: string;
  prompt: string;
  status: string;
  summary: string;
  sessionId: string | null;
  parentRunId: string | null;
  startedAt: string;
  endedAt: string | null;
};

type RunEvent = {
  id: string;
  runId: string;
  type: string;
  ts: string;
  payload: Record<string, unknown>;
};

type Notification = {
  id: string;
  workspaceId: string;
  runId: string | null;
  title: string;
  body: string;
  action: string;
  createdAt: string;
};

type QueueState = {
  config: {
    maxConcurrentRuns: number;
    maxExpensiveRuns: number;
  };
  activeCount: number;
  activeRunIds: string[];
  pausedWorkspaces: string[];
  queued: Array<{
    runId: string;
    workspaceSlug: string;
    provider: string;
    priority: string;
    enqueuedAt: string;
  }>;
};

type Timeline = {
  run: Run;
  totalDurationMs: number | null;
  steps: Array<{
    tool: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    durationMs: number | null;
  }>;
};

type ProviderSettings = {
  apiKey?: string;
  apiKeyEnv?: string;
  model?: string;
  maxTokens?: number;
  command?: string;
  args?: string[];
};

type ProviderProfile = {
  name: string;
  providers: Record<string, ProviderSettings>;
};

type ProviderProfilesResponse = {
  filePath: string;
  config: {
    defaultProfile: string;
    profiles: Record<string, ProviderProfile>;
  };
};

type ProviderValidation = {
  profile: string;
  ok: boolean;
  entries: Array<{
    provider: string;
    ok: boolean;
    checks: Array<{ name: string; ok: boolean; detail: string }>;
  }>;
};

const PREFERRED_PORT = 4228;
const MAX_PORT_SCAN = 10;
const themeStorageKey = "silo-dashboard-theme";
const debugSidebarStorageKey = "silo-dashboard-debug-collapsed";
const daemonCacheKey = "silo-daemon-url";
const isDev = import.meta.env.DEV;

let _resolvedDaemonBase: string | null = null;

async function discoverDaemon(): Promise<string> {
  if (_resolvedDaemonBase) return _resolvedDaemonBase;

  const envUrl = import.meta.env.VITE_SILO_DAEMON_URL;
  if (envUrl) {
    _resolvedDaemonBase = envUrl;
    return envUrl;
  }

  const cached = sessionStorage.getItem(daemonCacheKey);
  if (cached) {
    try {
      const res = await fetch(`${cached}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        _resolvedDaemonBase = cached;
        return cached;
      }
    } catch {
      // stale cache
    }
  }

  for (let i = 0; i < MAX_PORT_SCAN; i++) {
    const candidate = `http://127.0.0.1:${PREFERRED_PORT + i}`;
    try {
      const res = await fetch(`${candidate}/health`, { signal: AbortSignal.timeout(800) });
      if (res.ok) {
        const body = await res.json() as { service?: string };
        if (body.service === "silo-daemon") {
          _resolvedDaemonBase = candidate;
          sessionStorage.setItem(daemonCacheKey, candidate);
          return candidate;
        }
      }
    } catch {
      // try next
    }
  }

  const fallback = `http://127.0.0.1:${PREFERRED_PORT}`;
  _resolvedDaemonBase = fallback;
  return fallback;
}

function getDaemonBase(): string {
  return _resolvedDaemonBase ?? `http://127.0.0.1:${PREFERRED_PORT}`;
}

const providers = ["mock", "openai", "claude-api", "codex", "claude", "opencode"];

const commandsReference = [
  "silo up <project> --task \"...\" [--repo path]",
  "silo list",
  "silo switch <workspace-slug>",
  "silo run <workspace-slug> --prompt \"...\" [--provider ...] [--profile ...] [--priority ...]",
  "silo runs [--workspace <workspace-slug>]",
  "silo events [--run <run-id>]",
  "silo notifications [--workspace <workspace-slug>]",
  "silo review <workspace-slug> [--provider ...] [--profile ...]",
  "silo ship <workspace-slug> --message \"...\" [--no-checks] [--open-pr]",
  "silo gateway sync",
  "silo profiles show|use|set|validate",
  "silo queue show|config|pause|resume|cancel",
  "silo action <silo://...>",
];

const apiReference = [
  "GET /health",
  "GET/POST /api/workspaces",
  "POST /api/workspaces/:slug/switch",
  "GET/POST /api/runs",
  "GET /api/events",
  "GET /api/notifications",
  "GET /api/review",
  "POST /api/ship",
  "POST /api/gateway/sync",
  "GET/POST /api/providers",
  "POST /api/providers/default",
  "POST /api/providers/validate",
  "GET /api/runs/timeline",
  "GET /api/queue",
  "POST /api/queue/config",
  "POST /api/queue/workspace/pause|resume|cancel",
  "POST /api/actions/execute",
  "WS /ws",
];

async function apiGet<T>(path: string): Promise<T> {
  const base = await discoverDaemon();
  const response = await fetch(`${base}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const base = await discoverDaemon();
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => readInitialTheme());
  const [view, setView] = useState<ViewMode>("ops");
  const [stage, setStage] = useState<OpsStage>("setup");
  const [debugCollapsed, setDebugCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(debugSidebarStorageKey) === "1";
  });
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [focusedRun, setFocusedRun] = useState<Run | null>(null);
  const [continuePrompt, setContinuePrompt] = useState("");
  const [live, setLive] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<ProviderProfilesResponse | null>(null);
  const [validation, setValidation] = useState<ProviderValidation | null>(null);
  const [reviewResult, setReviewResult] = useState<unknown>(null);
  const [shipResult, setShipResult] = useState<unknown>(null);
  const [gatewayResult, setGatewayResult] = useState<unknown>(null);
  const [actionResult, setActionResult] = useState<unknown>(null);
  const [error, setError] = useState<string>("");

  const [createForm, setCreateForm] = useState({ projectSlug: "", task: "", repoPath: "" });
  const [runForm, setRunForm] = useState({ workspaceSlug: "", prompt: "", provider: "mock", profile: "", priority: "normal" });
  const [reviewForm, setReviewForm] = useState({ workspaceSlug: "", provider: "", profile: "" });
  const [shipForm, setShipForm] = useState({ workspaceSlug: "", commitMessage: "", runChecks: true, openPr: false });
  const [profileUseName, setProfileUseName] = useState("default");
  const [profileValidateName, setProfileValidateName] = useState("");
  const [profileSetForm, setProfileSetForm] = useState({
    profile: "default",
    provider: "openai",
    settingsJson: '{"model":"gpt-4.1-mini"}',
  });
  const [actionUri, setActionUri] = useState("silo://workspace/");

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(debugSidebarStorageKey, debugCollapsed ? "1" : "0");
  }, [debugCollapsed]);

  useEffect(() => {
    const wsBase = getDaemonBase().replace("http", "ws");
    const socket = new WebSocket(`${wsBase}/ws`);
    socket.onmessage = (message) => {
      const text = typeof message.data === "string" ? message.data : "";
      setLive((prev) => [text, ...prev].slice(0, 25));
      void refresh();
    };
    return () => socket.close();
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      setTimeline(null);
      return;
    }
    void loadTimeline(selectedRunId);
  }, [selectedRunId]);

  const totalRunning = useMemo(() => runs.filter((run) => run.status === "running").length, [runs]);
  const stageLabel = useMemo(() => {
    if (stage === "setup") return "1/4 Setup";
    if (stage === "run") return "2/4 Run";
    if (stage === "monitor") return "3/4 Monitor";
    return "4/4 Ship";
  }, [stage]);
  const cliDebugEvents = useMemo(
    () =>
      events
        .filter((event) => event.type === "tool.started" || event.type === "tool.finished")
        .filter((event) => typeof event.payload?.tool === "string" && event.payload.tool === "cli.exec")
        .slice(0, 15),
    [events]
  );

  async function refresh() {
    try {
      setError("");
      const [w, r, e, n, q, p] = await Promise.all([
        apiGet<Workspace[]>("/api/workspaces"),
        apiGet<Run[]>("/api/runs"),
        apiGet<RunEvent[]>("/api/events"),
        apiGet<Notification[]>("/api/notifications"),
        apiGet<QueueState>("/api/queue"),
        apiGet<ProviderProfilesResponse>("/api/providers"),
      ]);
      setWorkspaces(w);
      setRuns(r);
      setEvents(e);
      setNotifications(n);
      setQueue(q);
      setProfiles(p);

      if (!selectedRunId && r.length > 0) {
        setSelectedRunId(r[0].id);
      }

      if (w.length > 0) {
        const defaultSlug = w[0].slug;
        setRunForm((prev) => ({ ...prev, workspaceSlug: prev.workspaceSlug || defaultSlug }));
        setReviewForm((prev) => ({ ...prev, workspaceSlug: prev.workspaceSlug || defaultSlug }));
        setShipForm((prev) => ({ ...prev, workspaceSlug: prev.workspaceSlug || defaultSlug }));
        setActionUri((prev) => (prev === "silo://workspace/" ? `silo://workspace/${defaultSlug}` : prev));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh dashboard");
    }
  }

  async function loadTimeline(runId: string) {
    try {
      const data = await apiGet<Timeline>(`/api/runs/timeline?runId=${encodeURIComponent(runId)}`);
      setTimeline(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
    }
  }

  async function queueAction(path: string, payload: unknown) {
    try {
      await apiPost(path, payload);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Queue action failed");
    }
  }

  async function createWorkspace() {
    try {
      await apiPost("/api/workspaces", {
        projectSlug: createForm.projectSlug,
        task: createForm.task,
        repoPath: createForm.repoPath || undefined,
      });
      setCreateForm({ projectSlug: createForm.projectSlug, task: "", repoPath: createForm.repoPath });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workspace creation failed");
    }
  }

  async function switchWorkspace(slug: string) {
    try {
      await apiPost(`/api/workspaces/${slug}/switch`, {});
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workspace switch failed");
    }
  }

  async function createRun() {
    try {
      await apiPost("/api/runs", {
        workspaceSlug: runForm.workspaceSlug,
        provider: runForm.provider,
        prompt: runForm.prompt,
        profile: runForm.profile || undefined,
        priority: runForm.priority,
      });
      setRunForm((prev) => ({ ...prev, prompt: "" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run request failed");
    }
  }

  async function continueRun(run: Run) {
    if (!continuePrompt.trim()) return;
    const workspace = workspaces.find((w) => w.id === run.workspaceId);
    if (!workspace) {
      setError("Workspace not found for this run");
      return;
    }
    try {
      await apiPost("/api/runs", {
        workspaceSlug: workspace.slug,
        provider: run.provider,
        prompt: continuePrompt,
        priority: "normal",
        continueRunId: run.id,
      });
      setContinuePrompt("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Continue run failed");
    }
  }

  function getRunChain(run: Run): Run[] {
    const chain: Run[] = [];
    const visited = new Set<string>();

    let walkId: string | null = run.parentRunId;
    while (walkId && !visited.has(walkId)) {
      visited.add(walkId);
      const found: Run | undefined = runs.find((r) => r.id === walkId);
      if (!found) break;
      chain.unshift(found);
      walkId = found.parentRunId;
    }

    chain.push(run);
    const children = runs.filter((r) => r.parentRunId === run.id);
    chain.push(...children);
    return [...new Map(chain.map((r) => [r.id, r])).values()];
  }

  async function requestReview() {
    try {
      const params = new URLSearchParams({ workspace: reviewForm.workspaceSlug });
      if (reviewForm.provider) params.set("provider", reviewForm.provider);
      if (reviewForm.profile) params.set("profile", reviewForm.profile);
      const response = await apiGet<unknown>(`/api/review?${params.toString()}`);
      setReviewResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review request failed");
    }
  }

  async function requestShip() {
    try {
      const response = await apiPost<unknown>("/api/ship", {
        workspaceSlug: shipForm.workspaceSlug,
        commitMessage: shipForm.commitMessage,
        runChecks: shipForm.runChecks,
        openPr: shipForm.openPr,
      });
      setShipResult(response);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ship request failed");
    }
  }

  async function syncGateway() {
    try {
      const response = await apiPost<unknown>("/api/gateway/sync", {});
      setGatewayResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gateway sync failed");
    }
  }

  async function useProfile() {
    try {
      const response = await apiPost<ProviderProfilesResponse>("/api/providers/default", { profile: profileUseName });
      setProfiles(response);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile switch failed");
    }
  }

  async function setProfileProvider() {
    try {
      const parsed = JSON.parse(profileSetForm.settingsJson) as Record<string, unknown>;
      const response = await apiPost<ProviderProfilesResponse>("/api/providers", {
        profile: profileSetForm.profile,
        provider: profileSetForm.provider,
        settings: parsed,
      });
      setProfiles(response);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile set failed (check JSON) ");
    }
  }

  async function validateProfiles() {
    try {
      const report = await apiPost<ProviderValidation>("/api/providers/validate", {
        profile: profileValidateName || undefined,
      });
      setValidation(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile validation failed");
    }
  }

  async function executeAction() {
    try {
      const response = await apiPost<unknown>("/api/actions/execute", { action: actionUri });
      setActionResult(response);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action execution failed");
    }
  }

  return (
    <div className="page">
      <header className="hero frame">
        <div className="hero-copy">
          <p className="label">SILO / CONTROL SURFACE</p>
          <h1>BRUTALIST OPS BOARD</h1>
          <p className="subtitle">Full lifecycle controls: workspace, run, queue, providers, review, ship, gateway, actions.</p>
        </div>
        <div className="hero-actions">
          <div className="view-switch">
            <button className={view === "ops" ? "active" : ""} onClick={() => setView("ops")}>Ops</button>
            <button className={view === "docs" ? "active" : ""} onClick={() => setView("docs")}>Docs</button>
          </div>
          <button onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}>
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>
          <button onClick={() => void refresh()}>Force Refresh</button>
          {isDev && view === "ops" ? (
            <button onClick={() => setDebugCollapsed((value) => !value)}>
              {debugCollapsed ? "Show Debug" : "Hide Debug"}
            </button>
          ) : null}
          <div className="stamp">LIVE</div>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      {view === "docs" ? (
        <DocsView />
      ) : (
        <>
          <section className="flow-strip frame">
            <div className="flow-copy">
              <p className="label">Lifecycle Flow</p>
              <strong>{stageLabel}</strong>
            </div>
            <div className="flow-actions">
              <button className={stage === "setup" ? "active" : ""} onClick={() => setStage("setup")}>Setup</button>
              <button className={stage === "run" ? "active" : ""} onClick={() => setStage("run")}>Run</button>
              <button className={stage === "monitor" ? "active" : ""} onClick={() => setStage("monitor")}>Monitor</button>
              <button className={stage === "ship" ? "active" : ""} onClick={() => setStage("ship")}>Ship</button>
            </div>
          </section>

          <div className={`ops-shell ${isDev ? "with-debug" : ""} ${debugCollapsed ? "debug-collapsed" : ""}`}>
            <div className="ops-main">
              <section className="stats">
            <article className="stat frame">
              <h2>Workspaces</h2>
              <strong>{workspaces.length}</strong>
            </article>
            <article className="stat frame">
              <h2>Runs</h2>
              <strong>{runs.length}</strong>
            </article>
            <article className="stat frame">
              <h2>Running now</h2>
              <strong>{totalRunning}</strong>
            </article>
            <article className="stat frame">
              <h2>Queued</h2>
              <strong>{queue?.queued.length ?? 0}</strong>
            </article>
              </section>

              <section className="grid">
            {(stage === "setup" || stage === "run") ? <div className="panel frame">
              <h3>Create workspace</h3>
              <div className="form-grid">
                <input
                  placeholder="project slug"
                  value={createForm.projectSlug}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, projectSlug: event.target.value }))}
                />
                <input
                  placeholder="task"
                  value={createForm.task}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, task: event.target.value }))}
                />
                <input
                  placeholder="repo path (optional)"
                  value={createForm.repoPath}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, repoPath: event.target.value }))}
                />
              </div>
              <div className="actions">
                <button disabled={!createForm.projectSlug || !createForm.task} onClick={() => void createWorkspace()}>
                  Create (silo up)
                </button>
              </div>
              {workspaces.map((workspace) => (
                <div className="row" key={workspace.id}>
                  <span>{workspace.slug}</span>
                  <small>{workspace.branch}</small>
                  <small>{workspace.domain}</small>
                  <small className={`pill ${workspace.status}`}>{workspace.status.toUpperCase()}</small>
                  <div className="actions">
                    <button onClick={() => void switchWorkspace(workspace.slug)}>Switch</button>
                    <button onClick={() => void queueAction("/api/queue/workspace/pause", { workspaceSlug: workspace.slug })}>
                      Pause
                    </button>
                    <button onClick={() => void queueAction("/api/queue/workspace/resume", { workspaceSlug: workspace.slug })}>
                      Resume
                    </button>
                    <button onClick={() => void queueAction("/api/queue/workspace/cancel", { workspaceSlug: workspace.slug })}>
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div> : null}

            {(stage === "run" || stage === "monitor") ? <div className="panel frame">
              <h3>Run + timeline</h3>
              <div className="form-grid">
                <select
                  value={runForm.workspaceSlug}
                  onChange={(event) => setRunForm((prev) => ({ ...prev, workspaceSlug: event.target.value }))}
                >
                  <option value="">workspace</option>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.slug}>
                      {workspace.slug}
                    </option>
                  ))}
                </select>
                <select value={runForm.provider} onChange={(event) => setRunForm((prev) => ({ ...prev, provider: event.target.value }))}>
                  {providers.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
                <select value={runForm.priority} onChange={(event) => setRunForm((prev) => ({ ...prev, priority: event.target.value }))}>
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                </select>
                <input
                  placeholder="profile (optional)"
                  value={runForm.profile}
                  onChange={(event) => setRunForm((prev) => ({ ...prev, profile: event.target.value }))}
                />
                <textarea
                  placeholder="prompt"
                  value={runForm.prompt}
                  onChange={(event) => setRunForm((prev) => ({ ...prev, prompt: event.target.value }))}
                />
              </div>
              <div className="actions">
                <button disabled={!runForm.workspaceSlug || !runForm.prompt} onClick={() => void createRun()}>
                  Queue run (silo run)
                </button>
              </div>

              <label>
                Timeline Run
                <select value={selectedRunId} onChange={(event) => setSelectedRunId(event.target.value)}>
                  <option value="">select run</option>
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.id.slice(0, 8)} | {run.provider} | {run.status}
                    </option>
                  ))}
                </select>
              </label>

              {runs.slice(0, 12).map((run) => (
                <div
                  className={`row clickable ${focusedRun?.id === run.id ? "focused" : ""}`}
                  key={run.id}
                  onClick={() => {
                    setFocusedRun(focusedRun?.id === run.id ? null : run);
                    setSelectedRunId(run.id);
                    setContinuePrompt("");
                  }}
                >
                  <span>{run.provider} {run.parentRunId ? "(continued)" : ""}</span>
                  <small>{run.summary}</small>
                  <small className={`pill ${run.status}`}>{run.status.toUpperCase()}</small>
                  {run.sessionId ? <small>session: {run.sessionId.slice(0, 16)}...</small> : null}
                </div>
              ))}
            </div> : null}

            {focusedRun ? (
              <div className="panel wide frame">
                <h3>Run detail — {focusedRun.id.slice(0, 8)}</h3>
                <div className="row">
                  <span>Provider: {focusedRun.provider}</span>
                  <small>Status: {focusedRun.status}</small>
                  <small>Session: {focusedRun.sessionId ?? "none"}</small>
                  {focusedRun.parentRunId ? <small>Parent: {focusedRun.parentRunId.slice(0, 8)}</small> : null}
                  <small>Started: {new Date(focusedRun.startedAt).toLocaleString()}</small>
                  {focusedRun.endedAt ? <small>Ended: {new Date(focusedRun.endedAt).toLocaleString()}</small> : null}
                </div>

                <h4>Conversation chain</h4>
                {getRunChain(focusedRun).map((chainRun) => (
                  <div
                    className={`row clickable ${chainRun.id === focusedRun.id ? "focused" : ""}`}
                    key={chainRun.id}
                    onClick={() => {
                      setFocusedRun(chainRun);
                      setSelectedRunId(chainRun.id);
                    }}
                  >
                    <span>{chainRun.id.slice(0, 8)} — {chainRun.provider}</span>
                    <small className="prompt-text">{chainRun.prompt}</small>
                    <small>{chainRun.summary.slice(0, 200)}{chainRun.summary.length > 200 ? "..." : ""}</small>
                    <small className={`pill ${chainRun.status}`}>{chainRun.status.toUpperCase()}</small>
                  </div>
                ))}

                {focusedRun.status === "completed" || focusedRun.status === "failed" ? (
                  <div className="continue-box">
                    <h4>Continue this run</h4>
                    <textarea
                      placeholder="follow-up prompt..."
                      value={continuePrompt}
                      onChange={(event) => setContinuePrompt(event.target.value)}
                    />
                    <div className="actions">
                      <button disabled={!continuePrompt.trim()} onClick={() => void continueRun(focusedRun)}>
                        Continue conversation
                      </button>
                      <button onClick={() => setFocusedRun(null)}>Close</button>
                    </div>
                  </div>
                ) : (
                  <small>Run is {focusedRun.status} — wait for completion to continue.</small>
                )}
              </div>
            ) : null}

            {(stage === "run" || stage === "monitor") ? <div className="panel frame">
              <h3>Queue controls</h3>
              <small>
                Active: {queue?.activeCount ?? 0} / {queue?.config.maxConcurrentRuns ?? 0}
              </small>
              <small>Expensive limit: {queue?.config.maxExpensiveRuns ?? 0}</small>
              <div className="actions">
                <button
                  onClick={() =>
                    void queueAction("/api/queue/config", {
                      maxConcurrentRuns: (queue?.config.maxConcurrentRuns ?? 2) + 1,
                    })
                  }
                >
                  + Concurrent
                </button>
                <button
                  onClick={() =>
                    void queueAction("/api/queue/config", {
                      maxConcurrentRuns: Math.max(1, (queue?.config.maxConcurrentRuns ?? 2) - 1),
                    })
                  }
                >
                  - Concurrent
                </button>
                <button
                  onClick={() =>
                    void queueAction("/api/queue/config", {
                      maxExpensiveRuns: (queue?.config.maxExpensiveRuns ?? 1) + 1,
                    })
                  }
                >
                  + Expensive
                </button>
                <button
                  onClick={() =>
                    void queueAction("/api/queue/config", {
                      maxExpensiveRuns: Math.max(1, (queue?.config.maxExpensiveRuns ?? 1) - 1),
                    })
                  }
                >
                  - Expensive
                </button>
              </div>
              {queue?.queued.map((job) => (
                <div className="row" key={job.runId}>
                  <span>{job.workspaceSlug}</span>
                  <small>{job.provider}</small>
                  <small className={`pill priority-${job.priority}`}>{job.priority.toUpperCase()}</small>
                </div>
              ))}
            </div> : null}

            {(stage === "setup" || stage === "run") ? <div className="panel frame">
              <h3>Providers</h3>
              <small>Default: {profiles?.config.defaultProfile ?? "-"}</small>
              <small>File: {profiles?.filePath ?? "-"}</small>
              <div className="form-grid">
                <input value={profileUseName} onChange={(event) => setProfileUseName(event.target.value)} placeholder="profile name" />
                <button onClick={() => void useProfile()}>Use profile</button>
              </div>

              <div className="form-grid">
                <input
                  value={profileSetForm.profile}
                  onChange={(event) => setProfileSetForm((prev) => ({ ...prev, profile: event.target.value }))}
                  placeholder="profile"
                />
                <input
                  value={profileSetForm.provider}
                  onChange={(event) => setProfileSetForm((prev) => ({ ...prev, provider: event.target.value }))}
                  placeholder="provider"
                />
                <textarea
                  value={profileSetForm.settingsJson}
                  onChange={(event) => setProfileSetForm((prev) => ({ ...prev, settingsJson: event.target.value }))}
                />
                <button onClick={() => void setProfileProvider()}>Set provider config</button>
              </div>

              <div className="form-grid">
                <input
                  value={profileValidateName}
                  onChange={(event) => setProfileValidateName(event.target.value)}
                  placeholder="validate profile (optional)"
                />
                <button onClick={() => void validateProfiles()}>Validate profiles</button>
              </div>

              {validation ? (
                <div className="row">
                  <span>Validation: {validation.ok ? "OK" : "FAILED"}</span>
                  <small>Profile: {validation.profile}</small>
                  {validation.entries.map((entry) => (
                    <small key={entry.provider}>
                      {entry.provider}: {entry.ok ? "ok" : "fail"}
                    </small>
                  ))}
                </div>
              ) : null}
            </div> : null}

            {(stage === "ship" || stage === "setup") ? <div className="panel frame">
              <h3>Review + Ship</h3>
              <div className="form-grid">
                <select
                  value={reviewForm.workspaceSlug}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, workspaceSlug: event.target.value }))}
                >
                  <option value="">review workspace</option>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.slug}>
                      {workspace.slug}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="provider (optional)"
                  value={reviewForm.provider}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, provider: event.target.value }))}
                />
                <input
                  placeholder="profile (optional)"
                  value={reviewForm.profile}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, profile: event.target.value }))}
                />
                <button disabled={!reviewForm.workspaceSlug} onClick={() => void requestReview()}>
                  Run review
                </button>
                <button onClick={() => setStage("ship")}>Go to ship phase</button>
              </div>

              <div className="form-grid">
                <select
                  value={shipForm.workspaceSlug}
                  onChange={(event) => setShipForm((prev) => ({ ...prev, workspaceSlug: event.target.value }))}
                >
                  <option value="">ship workspace</option>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.slug}>
                      {workspace.slug}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="commit message"
                  value={shipForm.commitMessage}
                  onChange={(event) => setShipForm((prev) => ({ ...prev, commitMessage: event.target.value }))}
                />
                <label className="inline-option">
                  <input
                    type="checkbox"
                    checked={shipForm.runChecks}
                    onChange={(event) => setShipForm((prev) => ({ ...prev, runChecks: event.target.checked }))}
                  />
                  Run checks
                </label>
                <label className="inline-option">
                  <input
                    type="checkbox"
                    checked={shipForm.openPr}
                    onChange={(event) => setShipForm((prev) => ({ ...prev, openPr: event.target.checked }))}
                  />
                  Open PR
                </label>
                <button disabled={!shipForm.workspaceSlug || !shipForm.commitMessage} onClick={() => void requestShip()}>
                  Ship workspace
                </button>
              </div>
            </div> : null}

            {(stage === "ship" || stage === "monitor") ? <div className="panel frame">
              <h3>Gateway + Action URI</h3>
              <div className="actions">
                <button onClick={() => void syncGateway()}>Sync gateway</button>
              </div>
              <div className="form-grid">
                <input value={actionUri} onChange={(event) => setActionUri(event.target.value)} placeholder="silo://..." />
                <button onClick={() => void executeAction()}>Execute action</button>
              </div>
            </div> : null}

            {(stage === "monitor" || stage === "ship") ? <div className="panel frame">
              <h3>Notifications</h3>
              {notifications.slice(0, 10).map((notification) => (
                <div className="row" key={notification.id}>
                  <span>{notification.title}</span>
                  <small>{notification.body}</small>
                  <small>{notification.action}</small>
                  <div className="actions">
                    <button onClick={() => setActionUri(notification.action)}>Use action</button>
                    <button onClick={() => void apiPost("/api/actions/execute", { action: notification.action }).then(refresh)}>
                      Open
                    </button>
                    {notification.runId ? (
                      <button
                        onClick={() =>
                          void apiPost("/api/actions/execute", {
                            action: `silo://workspace/${workspaceSlugFromAction(notification.action) ?? "unknown"}/run/${notification.runId}/rerun`,
                          }).then(refresh)
                        }
                      >
                        Re-run
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div> : null}

            {(stage === "monitor" || stage === "run") ? <div className="panel wide frame">
              <h3>Run timeline</h3>
              {timeline ? (
                <>
                  <small>
                    Run {timeline.run.id.slice(0, 8)} | {timeline.run.provider} | {timeline.run.status} | Duration: {formatMs(timeline.totalDurationMs)}
                  </small>
                  {timeline.steps.map((step, index) => (
                    <div className="row" key={`${step.tool}-${index}`}>
                      <span>{step.tool}</span>
                      <small className={`pill ${step.status === "completed" ? "completed" : "failed"}`}>{step.status.toUpperCase()}</small>
                      <small>{new Date(step.startedAt).toLocaleTimeString()}</small>
                      <small>{formatMs(step.durationMs)}</small>
                    </div>
                  ))}
                </>
              ) : (
                <small>Select a run to inspect tool timeline.</small>
              )}
            </div> : null}

            {(stage === "ship" || stage === "monitor") ? <div className="panel wide frame">
              <h3>Responses</h3>
              <div className="response-grid">
                <div>
                  <small>Review result</small>
                  <pre>{reviewResult ? JSON.stringify(reviewResult, null, 2) : "-"}</pre>
                </div>
                <div>
                  <small>Ship result</small>
                  <pre>{shipResult ? JSON.stringify(shipResult, null, 2) : "-"}</pre>
                </div>
                <div>
                  <small>Gateway result</small>
                  <pre>{gatewayResult ? JSON.stringify(gatewayResult, null, 2) : "-"}</pre>
                </div>
                <div>
                  <small>Action result</small>
                  <pre>{actionResult ? JSON.stringify(actionResult, null, 2) : "-"}</pre>
                </div>
              </div>
            </div> : null}

            {stage === "monitor" ? <div className="panel wide frame">
              <h3>Live websocket feed</h3>
              {live.map((entry, index) => (
                <pre key={`${entry}-${index}`}>{entry}</pre>
              ))}
            </div> : null}

            {stage === "monitor" ? <div className="panel wide frame">
              <h3>Recent events</h3>
              {events.slice(0, 20).map((event) => (
                <div className="row" key={event.id}>
                  <span>{event.type}</span>
                  <small>{event.runId}</small>
                  <small>{new Date(event.ts).toLocaleTimeString()}</small>
                </div>
              ))}
            </div> : null}

              </section>
            </div>

            {isDev ? (
              <aside className={`debug-sidebar frame ${debugCollapsed ? "collapsed" : ""}`}>
                <div className="debug-head">
                  <h3>Dev debug (cli.exec)</h3>
                  <button onClick={() => setDebugCollapsed((value) => !value)}>
                    {debugCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
                {!debugCollapsed ? (
                  cliDebugEvents.length === 0 ? (
                    <small>No CLI debug events yet.</small>
                  ) : (
                    <pre>{JSON.stringify(cliDebugEvents, null, 2)}</pre>
                  )
                ) : (
                  <small>Debug stream hidden.</small>
                )}
              </aside>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function DocsView() {
  return (
    <section className="grid docs-grid">
      <div className="panel frame wide">
        <h3>Lifecycle</h3>
        <div className="row">
          <span>1) Workspace up</span>
          <small>Create deterministic slug, branch, worktree, profile, domain, ports.</small>
          <small>`silo up` or POST `/api/workspaces`</small>
        </div>
        <div className="row">
          <span>2) Run queue</span>
          <small>Queue jobs with priority and provider profile resolution.</small>
          <small>`silo run` or POST `/api/runs`</small>
        </div>
        <div className="row">
          <span>3) Event timeline</span>
          <small>Persist run/tool/usage events and replay tool steps.</small>
          <small>GET `/api/events`, GET `/api/runs/timeline`</small>
        </div>
        <div className="row">
          <span>4) Review and ship</span>
          <small>Snapshot git state, generate intelligence, run checks, commit, optional PR.</small>
          <small>`silo review`, `silo ship`</small>
        </div>
      </div>

      <div className="panel frame">
        <h3>CLI reference</h3>
        {commandsReference.map((command) => (
          <div className="row" key={command}>
            <small>{command}</small>
          </div>
        ))}
      </div>

      <div className="panel frame">
        <h3>Daemon API</h3>
        {apiReference.map((endpoint) => (
          <div className="row" key={endpoint}>
            <small>{endpoint}</small>
          </div>
        ))}
      </div>

      <div className="panel frame wide">
        <h3>Invariants</h3>
        <div className="row">
          <small>One task = one workspace = one worktree.</small>
          <small>Every run is traceable by workspace + run id.</small>
          <small>Notifications include jump targets (`silo://...`).</small>
          <small>Workspace switching is deterministic and fast.</small>
          <small>Identity does not depend on random localhost behavior.</small>
        </div>
      </div>
    </section>
  );
}

function formatMs(value: number | null): string {
  if (value === null) return "-";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function workspaceSlugFromAction(action: string): string | null {
  const parts = action.replace("silo://", "").split("/").filter(Boolean);
  if (parts[0] !== "workspace") return null;
  return parts[1] ?? null;
}

function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
