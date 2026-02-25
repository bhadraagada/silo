export type WorkspaceStatus = "idle" | "active" | "running" | "error" | "archived";

export type RunStatus = "queued" | "running" | "failed" | "completed" | "cancelled";

export type EventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "run.cancelled"
  | "tool.started"
  | "tool.finished"
  | "llm.usage"
  | "workspace.created"
  | "workspace.switched"
  | "notification.sent";

export interface Project {
  id: string;
  slug: string;
  repoPath: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  projectId: string;
  projectSlug: string;
  task: string;
  slug: string;
  branch: string;
  worktreePath: string;
  browserProfilePath: string;
  domain: string;
  appPort: number;
  apiPort: number;
  createdAt: string;
  updatedAt: string;
  status: WorkspaceStatus;
}

export interface AgentRun {
  id: string;
  workspaceId: string;
  provider: string;
  prompt: string;
  status: RunStatus;
  summary: string;
  sessionId: string | null;
  parentRunId: string | null;
  tokenInput: number;
  tokenOutput: number;
  costUsd: number;
  cancelReason: string | null;
  cancelledAt: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface RunEvent {
  id: string;
  runId: string;
  workspaceId: string;
  ts: string;
  type: EventType;
  payload: Record<string, unknown>;
}

export interface NotificationEvent {
  id: string;
  workspaceId: string;
  runId: string | null;
  title: string;
  body: string;
  action: string;
  seen: boolean;
  createdAt: string;
}

export interface UpWorkspaceInput {
  projectSlug: string;
  task: string;
  repoPath?: string;
}

export interface RunWorkspaceInput {
  workspaceSlug: string;
  provider: string;
  prompt: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  continueRunId?: string;
}

export interface WorkspaceRuntimeTarget {
  terminalSession: string;
  editorPath: string;
  browserUrl: string;
}
