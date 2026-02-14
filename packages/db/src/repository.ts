import { Database } from "bun:sqlite";
import type { AgentRun, NotificationEvent, Project, RunEvent, Workspace } from "@silo/core";
import { newId, nowIso } from "@silo/core";

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export class SiloRepository {
  constructor(private readonly db: Database) {}

  createProject(slug: string, repoPath: string): Project {
    const now = nowIso();
    const existing = this.getProjectBySlug(slug);
    if (existing) {
      return existing;
    }
    const project: Project = {
      id: newId("prj"),
      slug,
      repoPath,
      createdAt: now,
    };
    this.db
      .query("INSERT INTO projects (id, slug, repo_path, created_at) VALUES (?, ?, ?, ?)")
      .run(project.id, project.slug, project.repoPath, project.createdAt);
    return project;
  }

  getProjectBySlug(slug: string): Project | null {
    const row = this.db.query("SELECT * FROM projects WHERE slug = ?").get(slug) as
      | { id: string; slug: string; repo_path: string; created_at: string }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      repoPath: row.repo_path,
      createdAt: row.created_at,
    };
  }

  upsertWorkspace(workspace: Workspace): Workspace {
    const existing = this.getWorkspaceBySlug(workspace.slug);
    if (!existing) {
      this.db
        .query(
          `INSERT INTO workspaces (
            id, project_id, project_slug, task, slug, branch, worktree_path, browser_profile_path,
            domain, app_port, api_port, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          workspace.id,
          workspace.projectId,
          workspace.projectSlug,
          workspace.task,
          workspace.slug,
          workspace.branch,
          workspace.worktreePath,
          workspace.browserProfilePath,
          workspace.domain,
          workspace.appPort,
          workspace.apiPort,
          workspace.status,
          workspace.createdAt,
          workspace.updatedAt
        );
      return workspace;
    }

    this.db
      .query(
        `UPDATE workspaces
         SET branch = ?, worktree_path = ?, browser_profile_path = ?, domain = ?, app_port = ?, api_port = ?,
             status = ?, updated_at = ?
         WHERE slug = ?`
      )
      .run(
        workspace.branch,
        workspace.worktreePath,
        workspace.browserProfilePath,
        workspace.domain,
        workspace.appPort,
        workspace.apiPort,
        workspace.status,
        workspace.updatedAt,
        workspace.slug
      );

    return this.getWorkspaceBySlug(workspace.slug) as Workspace;
  }

  listWorkspaces(): Workspace[] {
    const rows = this.db.query("SELECT * FROM workspaces ORDER BY updated_at DESC").all() as Array<
      Record<string, unknown>
    >;
    return rows.map((row) => this.mapWorkspaceRow(row));
  }

  getWorkspaceBySlug(slug: string): Workspace | null {
    const row = this.db.query("SELECT * FROM workspaces WHERE slug = ?").get(slug) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapWorkspaceRow(row);
  }

  createRun(input: Omit<AgentRun, "id" | "startedAt" | "endedAt">): AgentRun {
    const now = nowIso();
    const run: AgentRun = {
      ...input,
      id: newId("run"),
      startedAt: now,
      endedAt: null,
    };
    this.db
      .query(
        `INSERT INTO runs (id, workspace_id, provider, prompt, status, summary, session_id, parent_run_id, token_input, token_output, cost_usd, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        run.id,
        run.workspaceId,
        run.provider,
        run.prompt,
        run.status,
        run.summary,
        run.sessionId,
        run.parentRunId,
        run.tokenInput,
        run.tokenOutput,
        run.costUsd,
        run.startedAt,
        run.endedAt
      );
    return run;
  }

  updateRun(run: AgentRun): void {
    this.db
      .query(
        `UPDATE runs
         SET status = ?, summary = ?, session_id = ?, token_input = ?, token_output = ?, cost_usd = ?, ended_at = ?
         WHERE id = ?`
      )
      .run(run.status, run.summary, run.sessionId, run.tokenInput, run.tokenOutput, run.costUsd, run.endedAt, run.id);
  }

  getRunById(runId: string): AgentRun | null {
    const row = this.db.query("SELECT * FROM runs WHERE id = ?").get(runId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRunRow(row);
  }

  listRuns(workspaceId?: string): AgentRun[] {
    const query = workspaceId
      ? this.db.query("SELECT * FROM runs WHERE workspace_id = ? ORDER BY started_at DESC")
      : this.db.query("SELECT * FROM runs ORDER BY started_at DESC");
    const rows = (workspaceId ? query.all(workspaceId) : query.all()) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapRunRow(row));
  }

  addEvent(input: Omit<RunEvent, "id" | "ts">): RunEvent {
    const event: RunEvent = {
      ...input,
      id: newId("evt"),
      ts: nowIso(),
    };
    this.db
      .query("INSERT INTO run_events (id, run_id, workspace_id, ts, type, payload_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(event.id, event.runId, event.workspaceId, event.ts, event.type, JSON.stringify(event.payload));
    return event;
  }

  listEvents(runId?: string): RunEvent[] {
    const query = runId
      ? this.db.query("SELECT * FROM run_events WHERE run_id = ? ORDER BY ts DESC")
      : this.db.query("SELECT * FROM run_events ORDER BY ts DESC LIMIT 500");
    const rows = (runId ? query.all(runId) : query.all()) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      runId: String(row.run_id),
      workspaceId: String(row.workspace_id),
      ts: String(row.ts),
      type: String(row.type) as RunEvent["type"],
      payload: parseJson<Record<string, unknown>>(String(row.payload_json)),
    }));
  }

  addNotification(input: Omit<NotificationEvent, "id" | "createdAt" | "seen">): NotificationEvent {
    const notification: NotificationEvent = {
      ...input,
      id: newId("noti"),
      seen: false,
      createdAt: nowIso(),
    };
    this.db
      .query(
        "INSERT INTO notifications (id, workspace_id, run_id, title, body, action, seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        notification.id,
        notification.workspaceId,
        notification.runId,
        notification.title,
        notification.body,
        notification.action,
        0,
        notification.createdAt
      );
    return notification;
  }

  listNotifications(workspaceId?: string): NotificationEvent[] {
    const query = workspaceId
      ? this.db.query("SELECT * FROM notifications WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200")
      : this.db.query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200");
    const rows = (workspaceId ? query.all(workspaceId) : query.all()) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      runId: row.run_id ? String(row.run_id) : null,
      title: String(row.title),
      body: String(row.body),
      action: String(row.action),
      seen: Number(row.seen) === 1,
      createdAt: String(row.created_at),
    }));
  }

  private mapWorkspaceRow(row: Record<string, unknown>): Workspace {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      projectSlug: String(row.project_slug),
      task: String(row.task),
      slug: String(row.slug),
      branch: String(row.branch),
      worktreePath: String(row.worktree_path),
      browserProfilePath: String(row.browser_profile_path),
      domain: String(row.domain),
      appPort: Number(row.app_port),
      apiPort: Number(row.api_port),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      status: String(row.status) as Workspace["status"],
    };
  }

  private mapRunRow(row: Record<string, unknown>): AgentRun {
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      provider: String(row.provider),
      prompt: String(row.prompt),
      status: String(row.status) as AgentRun["status"],
      summary: String(row.summary),
      sessionId: row.session_id ? String(row.session_id) : null,
      parentRunId: row.parent_run_id ? String(row.parent_run_id) : null,
      tokenInput: Number(row.token_input),
      tokenOutput: Number(row.token_output),
      costUsd: Number(row.cost_usd),
      startedAt: String(row.started_at),
      endedAt: row.ended_at ? String(row.ended_at) : null,
    };
  }
}
