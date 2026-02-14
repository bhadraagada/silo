import { useEffect, useMemo, useState } from "react";

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
  status: string;
  summary: string;
  startedAt: string;
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

const daemonBase = import.meta.env.VITE_SILO_DAEMON_URL ?? "http://127.0.0.1:4228";

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${daemonBase}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${daemonBase}${path}`, {
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [live, setLive] = useState<string[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const socket = new WebSocket(`${daemonBase.replace("http", "ws")}/ws`);
    socket.onmessage = (message) => {
      const text = typeof message.data === "string" ? message.data : "";
      setLive((prev) => [text, ...prev].slice(0, 20));
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

  async function refresh() {
    try {
      setError("");
      const [w, r, e, n, q] = await Promise.all([
        apiGet<Workspace[]>("/api/workspaces"),
        apiGet<Run[]>("/api/runs"),
        apiGet<RunEvent[]>("/api/events"),
        apiGet<Notification[]>("/api/notifications"),
        apiGet<QueueState>("/api/queue"),
      ]);
      setWorkspaces(w);
      setRuns(r);
      setEvents(e);
      setNotifications(n);
      setQueue(q);

      if (!selectedRunId && r.length > 0) {
        setSelectedRunId(r[0].id);
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
    await apiPost(path, payload);
    await refresh();
  }

  async function executeAction(action: string) {
    try {
      await apiPost("/api/actions/execute", { action });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute action");
    }
  }

  return (
    <div className="page">
      <header className="hero frame">
        <div className="hero-copy">
          <p className="label">SILO / CONTROL SURFACE</p>
          <h1>BRUTALIST OPS BOARD</h1>
          <p className="subtitle">Hard edges. Loud hierarchy. Zero ambiguity in parallel agent runs.</p>
        </div>
        <div className="hero-actions">
          <button onClick={() => void refresh()}>Force Refresh</button>
          <div className="stamp">LIVE</div>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

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
        <div className="panel frame">
          <h3>Workspaces</h3>
          {workspaces.map((workspace) => (
            <div className="row" key={workspace.id}>
              <span>{workspace.slug}</span>
              <small>{workspace.branch}</small>
              <small>{workspace.domain}</small>
              <small className={`pill ${workspace.status}`}>{workspace.status.toUpperCase()}</small>
              <div className="actions">
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
        </div>

        <div className="panel frame">
          <h3>Runs</h3>
          <label>
            Timeline Run
            <select value={selectedRunId} onChange={(event) => setSelectedRunId(event.target.value)}>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id.slice(0, 8)} | {run.provider} | {run.status}
                </option>
              ))}
            </select>
          </label>
          {runs.map((run) => (
            <div className="row" key={run.id}>
              <span>{run.provider}</span>
              <small>{run.summary}</small>
              <small className={`pill ${run.status}`}>{run.status.toUpperCase()}</small>
            </div>
          ))}
        </div>

        <div className="panel frame">
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
        </div>

        <div className="panel frame">
          <h3>Notifications</h3>
          {notifications.slice(0, 10).map((notification) => (
            <div className="row" key={notification.id}>
              <span>{notification.title}</span>
              <small>{notification.body}</small>
              <small>{notification.action}</small>
              <div className="actions">
                <button onClick={() => void executeAction(notification.action)}>Open</button>
                {notification.runId ? (
                  <button
                    onClick={() =>
                      void executeAction(
                        `silo://workspace/${workspaceSlugFromAction(notification.action) ?? "unknown"}/run/${notification.runId}/rerun`
                      )
                    }
                  >
                    Re-run
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="panel wide frame">
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
        </div>

        <div className="panel wide frame">
          <h3>Live websocket feed</h3>
          {live.map((entry, index) => (
            <pre key={`${entry}-${index}`}>{entry}</pre>
          ))}
        </div>

        <div className="panel wide frame">
          <h3>Recent events</h3>
          {events.slice(0, 20).map((event) => (
            <div className="row" key={event.id}>
              <span>{event.type}</span>
              <small>{event.runId}</small>
              <small>{new Date(event.ts).toLocaleTimeString()}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
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
