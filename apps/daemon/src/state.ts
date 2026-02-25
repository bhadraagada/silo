import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import type { ServerWebSocket } from "bun";
import {
  createWorkspaceSeed,
  newId,
  nowIso,
  toSafeSlug,
  touchWorkspace,
  type AgentRun,
  type RunEvent,
  type RunWorkspaceInput,
  type UpWorkspaceInput,
  type Workspace,
} from "@silo/core";
import { createSiloDb } from "@silo/db";
import { syncGatewayConfigs, workspaceUrl } from "@silo/gateway";
import { ensureWorktree, repoRoot, reviewWorkspace, shipWorkspace } from "@silo/git";
import { getAdapter } from "@silo/agent-adapters";
import { ensureSiloDirs, launchBrowser, launchEditor, notify, switchToTerminalSession } from "@silo/os-adapters";
import {
  loadProfiles,
  providersFilePath,
  resolveProviderConfig,
  setDefaultProfile,
  upsertProviderProfile,
} from "./provider-profiles";
import { validateProviderProfile } from "./provider-validate";
import { runGatewayReloadHooks } from "./gateway-hooks";
import { generateReviewIntel } from "./review-intel";

export interface DaemonConfig {
  host: string;
  port: number;
}

type QueuePriority = "low" | "normal" | "high";

interface QueueJob {
  runId: string;
  workspaceId: string;
  workspaceSlug: string;
  input: RunWorkspaceInput;
  priority: QueuePriority;
  enqueuedAt: string;
}

interface QueueConfig {
  maxConcurrentRuns: number;
  maxExpensiveRuns: number;
  maxWorkspaceRuns: number;
  starvationThresholdMs: number;
}

interface ToolTimelineStep {
  tool: string;
  status: "completed" | "incomplete";
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  tokenInput: number;
  tokenOutput: number;
  costUsd: number;
  startPayload: Record<string, unknown>;
  endPayload: Record<string, unknown> | null;
}

interface TimelineUsageRollup {
  totalTokenInput: number;
  totalTokenOutput: number;
  totalCostUsd: number;
  usageEvents: number;
  byTool: Array<{
    tool: string;
    tokenInput: number;
    tokenOutput: number;
    costUsd: number;
    usageEvents: number;
  }>;
}

interface RetryChainInfo {
  rootRunId: string;
  parentRunId: string | null;
  childRunIds: string[];
  ancestorRunIds: string[];
  descendantRunIds: string[];
  chainRunIds: string[];
}

const EXPENSIVE_PROVIDERS = new Set(["openai", "claude-api", "anthropic"]);

function isTestMode(): boolean {
  return process.env.SILO_TEST_MODE === "1";
}

export class DaemonState {
  readonly config: DaemonConfig;
  private readonly repo = createSiloDb({ filePath: ensureSiloDirs().dbPath });
  private readonly sockets = new Set<ServerWebSocket<unknown>>();

  private queue: QueueJob[] = [];
  private readonly activeRuns = new Map<string, { workspaceId: string; provider: string }>();
  private readonly activeRunControllers = new Map<string, AbortController>();
  private readonly pausedWorkspaces = new Set<string>();
  private readonly cancelRequestedRuns = new Set<string>();
  private queueConfig: QueueConfig = {
    maxConcurrentRuns: Number(process.env.SILO_MAX_CONCURRENT_RUNS ?? "2"),
    maxExpensiveRuns: Number(process.env.SILO_MAX_EXPENSIVE_RUNS ?? "1"),
    maxWorkspaceRuns: Number(process.env.SILO_MAX_WORKSPACE_RUNS ?? "1"),
    starvationThresholdMs: Number(process.env.SILO_QUEUE_STARVATION_MS ?? "120000"),
  };

  constructor(config: DaemonConfig) {
    this.config = config;
  }

  connect(socket: ServerWebSocket<unknown>): void {
    this.sockets.add(socket);
  }

  disconnect(socket: ServerWebSocket<unknown>): void {
    this.sockets.delete(socket);
  }

  broadcast(type: string, payload: Record<string, unknown>): void {
    const message = JSON.stringify({ type, payload, ts: nowIso() });
    for (const socket of this.sockets) {
      socket.send(message);
    }
  }

  upWorkspace(input: UpWorkspaceInput): Workspace {
    const projectSlug = toSafeSlug(input.projectSlug);
    const task = input.task;
    const repoPath = input.repoPath ? repoRoot(input.repoPath) : repoRoot(process.cwd());
    const seed = createWorkspaceSeed({ projectSlug, task, repoPath });

    const project = this.repo.createProject(projectSlug, repoPath);
    const worktree = ensureWorktree({
      repoPath,
      branch: seed.branch,
      workspaceSlug: seed.slug,
    });

    const siloRoot = ensureSiloDirs().rootDir;
    const profilePath = join(siloRoot, "profiles", seed.profileDirName);
    mkdirSync(dirname(profilePath), { recursive: true });

    const timestamp = nowIso();
    const workspace: Workspace = {
      id: newId("ws"),
      projectId: project.id,
      projectSlug,
      task,
      slug: seed.slug,
      branch: seed.branch,
      worktreePath: worktree.worktreePath,
      browserProfilePath: profilePath,
      domain: seed.domain,
      appPort: seed.appPort,
      apiPort: seed.apiPort,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const saved = this.repo.upsertWorkspace(workspace);
    this.repo.addEvent({
      runId: "system",
      workspaceId: saved.id,
      type: "workspace.created",
      payload: { slug: saved.slug, branch: saved.branch, domain: saved.domain },
    });
    this.broadcast("workspace.upserted", { workspace: saved });
    this.syncGateway();

    if (!isTestMode()) {
      launchEditor({ path: saved.worktreePath });
      launchBrowser({ url: workspaceUrl(saved), profilePath: saved.browserProfilePath });
      switchToTerminalSession(saved.slug, saved.worktreePath);
      notify({
        title: `silo: ${saved.slug}`,
        body: `Workspace ready at ${saved.domain}`,
      });
    }

    return saved;
  }

  listWorkspaces(): Workspace[] {
    return this.repo.listWorkspaces();
  }

  switchWorkspace(slug: string): Workspace {
    const existing = this.repo.getWorkspaceBySlug(slug);
    if (!existing) {
      throw new Error(`Workspace not found: ${slug}`);
    }
    const updated = touchWorkspace(existing, "active");
    const saved = this.repo.upsertWorkspace(updated);

    if (!isTestMode()) {
      launchEditor({ path: saved.worktreePath });
      launchBrowser({ url: workspaceUrl(saved), profilePath: saved.browserProfilePath });
      switchToTerminalSession(saved.slug, saved.worktreePath);
    }

    this.repo.addEvent({
      runId: "system",
      workspaceId: saved.id,
      type: "workspace.switched",
      payload: { slug: saved.slug },
    });
    this.broadcast("workspace.switched", { workspace: saved });
    this.syncGateway();
    return saved;
  }

  syncGateway() {
    const output = syncGatewayConfigs(this.repo.listWorkspaces());
    const reload = runGatewayReloadHooks(output.caddyFilePath, output.traefikFilePath);
    const result = {
      ...output,
      reload,
    };
    this.broadcast("gateway.synced", {
      caddyFilePath: result.caddyFilePath,
      traefikFilePath: result.traefikFilePath,
      caddyReloaded: result.reload.caddyReloaded,
      traefikReloaded: result.reload.traefikReloaded,
    });
    return result;
  }

  getProviderProfiles() {
    return {
      filePath: providersFilePath(),
      config: loadProfiles(),
    };
  }

  useProviderProfile(name: string) {
    return {
      filePath: providersFilePath(),
      config: setDefaultProfile(name),
    };
  }

  setProviderProfile(name: string, provider: string, settings: Record<string, unknown>) {
    const normalized = {
      apiKey: typeof settings.apiKey === "string" ? settings.apiKey : undefined,
      apiKeyEnv: typeof settings.apiKeyEnv === "string" ? settings.apiKeyEnv : undefined,
      model: typeof settings.model === "string" ? settings.model : undefined,
      maxTokens: typeof settings.maxTokens === "number" ? settings.maxTokens : undefined,
      command: typeof settings.command === "string" ? settings.command : undefined,
      args:
        Array.isArray(settings.args) && settings.args.every((item) => typeof item === "string")
          ? (settings.args as string[])
          : undefined,
      timeoutMs: typeof settings.timeoutMs === "number" ? settings.timeoutMs : undefined,
    };
    return {
      filePath: providersFilePath(),
      config: upsertProviderProfile(name, provider, normalized),
    };
  }

  async validateProviderProfiles(profile?: string) {
    const config = loadProfiles();
    const target = profile ?? config.defaultProfile;
    return {
      filePath: providersFilePath(),
      report: await validateProviderProfile(config, target),
    };
  }

  listRuns(workspaceSlug?: string): AgentRun[] {
    if (!workspaceSlug) {
      return this.repo.listRuns();
    }
    const workspace = this.repo.getWorkspaceBySlug(workspaceSlug);
    if (!workspace) return [];
    return this.repo.listRuns(workspace.id);
  }

  listEvents(runId?: string): RunEvent[] {
    return this.repo.listEvents(runId);
  }

  listNotifications(workspaceSlug?: string) {
    if (!workspaceSlug) return this.repo.listNotifications();
    const workspace = this.repo.getWorkspaceBySlug(workspaceSlug);
    if (!workspace) return [];
    return this.repo.listNotifications(workspace.id);
  }

  async reviewWorkspace(workspaceSlug: string, options?: { provider?: string; profile?: string }) {
    const workspace = this.repo.getWorkspaceBySlug(workspaceSlug);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceSlug}`);
    }

    const snapshot = reviewWorkspace(workspace.worktreePath);
    const recentRuns = this.repo.listRuns(workspace.id).slice(0, 10);
    const provider = options?.provider;
    const providerConfig = provider ? resolveProviderConfig(provider, options?.profile) : undefined;
    const intelligence = await generateReviewIntel({ snapshot, recentRuns, provider, providerConfig });

    return {
      workspace,
      snapshot,
      recentRuns,
      intelligence,
    };
  }

  shipWorkspace(input: {
    workspaceSlug: string;
    commitMessage: string;
    runChecks?: boolean;
    openPr?: boolean;
    checks?: string[];
    prTitle?: string;
    prBody?: string;
  }) {
    const workspace = this.repo.getWorkspaceBySlug(input.workspaceSlug);
    if (!workspace) {
      throw new Error(`Workspace not found: ${input.workspaceSlug}`);
    }

    const result = shipWorkspace(workspace.worktreePath, {
      commitMessage: input.commitMessage,
      runChecks: input.runChecks,
      openPr: input.openPr,
      checks: input.checks,
      prTitle: input.prTitle,
      prBody: input.prBody,
    });

    const notif = this.repo.addNotification({
      workspaceId: workspace.id,
      runId: null,
      title: `${workspace.slug} ship ${result.committed ? "completed" : "skipped"}`,
      body: result.committed
        ? `Committed ${result.commitSha?.slice(0, 8) ?? "changes"}${result.prUrl ? ` | PR: ${result.prUrl}` : ""}`
        : "No changes to commit.",
      action: `silo://workspace/${workspace.slug}/ship`,
    });
    this.broadcast("notification", { notification: notif });
    if (!isTestMode()) {
      notify({ title: notif.title, body: notif.body });
    }

    return {
      workspace,
      ...result,
    };
  }

  runWorkspace(input: RunWorkspaceInput): AgentRun {
    const workspace = this.repo.getWorkspaceBySlug(input.workspaceSlug);
    if (!workspace) {
      throw new Error(`Workspace not found: ${input.workspaceSlug}`);
    }

    const priority = input.priority ?? "normal";
    let parentSessionId: string | null = null;
    let parentRunId: string | null = null;
    if (input.continueRunId) {
      const parentRun = this.repo.getRunById(input.continueRunId);
      if (parentRun) {
        parentSessionId = parentRun.sessionId;
        parentRunId = parentRun.id;
      }
    }

    const run = this.repo.createRun({
      workspaceId: workspace.id,
      provider: input.provider,
      prompt: input.prompt,
      status: "queued",
      summary: parentRunId ? `Continue of ${parentRunId.slice(0, 8)} (${priority})` : `Queued (${priority})`,
      sessionId: parentSessionId,
      parentRunId,
      tokenInput: 0,
      tokenOutput: 0,
      costUsd: 0,
      cancelReason: null,
      cancelledAt: null,
    });

    this.queue.push({
      runId: run.id,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      input,
      priority,
      enqueuedAt: nowIso(),
    });
    this.sortQueue();
    this.broadcast("run.queued", { run, queue: this.getQueueState() });
    this.processQueue();
    return run;
  }

  getQueueState() {
    return {
      config: this.queueConfig,
      activeRunIds: Array.from(this.activeRuns.keys()),
      activeCount: this.activeRuns.size,
      pausedWorkspaces: Array.from(this.pausedWorkspaces.values()),
      queued: this.queue.map((job) => ({
        runId: job.runId,
        workspaceSlug: job.workspaceSlug,
        provider: job.input.provider,
        priority: job.priority,
        enqueuedAt: job.enqueuedAt,
      })),
    };
  }

  setQueueConfig(input: {
    maxConcurrentRuns?: number;
    maxExpensiveRuns?: number;
    maxWorkspaceRuns?: number;
    starvationThresholdMs?: number;
  }) {
    this.queueConfig = {
      maxConcurrentRuns: input.maxConcurrentRuns ?? this.queueConfig.maxConcurrentRuns,
      maxExpensiveRuns: input.maxExpensiveRuns ?? this.queueConfig.maxExpensiveRuns,
      maxWorkspaceRuns: input.maxWorkspaceRuns ?? this.queueConfig.maxWorkspaceRuns,
      starvationThresholdMs: input.starvationThresholdMs ?? this.queueConfig.starvationThresholdMs,
    };
    this.processQueue();
    return this.getQueueState();
  }

  pauseWorkspaceQueue(workspaceSlug: string) {
    this.pausedWorkspaces.add(workspaceSlug);
    this.broadcast("queue.updated", { queue: this.getQueueState() });
    return this.getQueueState();
  }

  resumeWorkspaceQueue(workspaceSlug: string) {
    this.pausedWorkspaces.delete(workspaceSlug);
    this.processQueue();
    this.broadcast("queue.updated", { queue: this.getQueueState() });
    return this.getQueueState();
  }

  cancelWorkspaceRuns(workspaceSlug: string) {
    const workspace = this.repo.getWorkspaceBySlug(workspaceSlug);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceSlug}`);
    }

    const cancelledRunIds = this.queue.filter((job) => job.workspaceSlug === workspaceSlug).map((job) => job.runId);
    this.queue = this.queue.filter((job) => job.workspaceSlug !== workspaceSlug);

    for (const runId of cancelledRunIds) {
      const run = this.repo.getRunById(runId);
      if (!run) continue;
      const cancelledAt = nowIso();
      this.repo.updateRun({
        ...run,
        status: "cancelled",
        summary: "Cancelled before execution",
        cancelReason: "Cancelled before execution",
        cancelledAt,
        endedAt: cancelledAt,
      });
    }

    const runningRunIds = Array.from(this.activeRuns.entries())
      .filter(([, active]) => active.workspaceId === workspace.id)
      .map(([runId]) => runId);

    for (const runId of runningRunIds) {
      this.cancelRequestedRuns.add(runId);
      const controller = this.activeRunControllers.get(runId);
      controller?.abort();
    }

    this.broadcast("queue.updated", { queue: this.getQueueState() });
    return {
      cancelledQueuedRuns: cancelledRunIds.length,
      cancelledRunningRuns: runningRunIds.length,
      runningCancellationRequested: runningRunIds.length > 0,
    };
  }

  getRunTimeline(runId: string) {
    const run = this.repo.getRunById(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const events = this.repo.listEvents(runId).sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const steps = this.buildTimelineSteps(events);
    const usage = this.applyUsageRollups(steps, events, run);
    const retryChain = this.buildRetryChain(run);
    const startedAt = events[0]?.ts ?? run.startedAt;
    const endedAt = run.endedAt ?? events.at(-1)?.ts ?? null;

    return {
      run,
      startedAt,
      endedAt,
      totalDurationMs:
        endedAt && startedAt ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()) : null,
      steps: usage.steps,
      usageRollup: usage.rollup,
      retryChain,
      events,
    };
  }

  executeAction(action: string) {
    const parsed = parseSiloAction(action);
    if (!parsed) {
      throw new Error(`Unsupported action URI: ${action}`);
    }

    if (parsed.kind === "open-workspace") {
      const workspace = this.switchWorkspace(parsed.workspaceSlug);
      return { ok: true, action, result: { workspace } };
    }

    if (parsed.kind === "open-logs") {
      return { ok: true, action, result: this.getRunTimeline(parsed.runId) };
    }

    if (parsed.kind === "rerun") {
      const existing = this.repo.getRunById(parsed.runId);
      if (!existing) {
        throw new Error(`Run not found for rerun: ${parsed.runId}`);
      }
      const workspace = this.repo.listWorkspaces().find((ws) => ws.id === existing.workspaceId);
      if (!workspace) {
        throw new Error("Workspace missing for rerun");
      }
      const rerun = this.runWorkspace({
        workspaceSlug: workspace.slug,
        provider: existing.provider,
        prompt: existing.prompt,
        priority: "high",
      });
      return { ok: true, action, result: { rerun } };
    }

    throw new Error(`Unsupported action kind for URI: ${action}`);
  }

  private processQueue(): void {
    while (this.activeRuns.size < this.queueConfig.maxConcurrentRuns) {
      const next = this.pickNextJob();
      if (!next) {
        return;
      }

      this.activeRuns.set(next.runId, { workspaceId: next.workspaceId, provider: next.input.provider });
      void this.executeQueuedRun(next).finally(() => {
        this.activeRuns.delete(next.runId);
        this.broadcast("queue.updated", { queue: this.getQueueState() });
        this.processQueue();
      });
    }
  }

  private pickNextJob(): QueueJob | null {
    const expensiveActive = Array.from(this.activeRuns.values()).filter((run) =>
      EXPENSIVE_PROVIDERS.has(run.provider.toLowerCase())
    ).length;

    const activeByWorkspace = new Map<string, number>();
    for (const active of this.activeRuns.values()) {
      activeByWorkspace.set(active.workspaceId, (activeByWorkspace.get(active.workspaceId) ?? 0) + 1);
    }

    const starvationCutoff = Date.now() - this.queueConfig.starvationThresholdMs;
    let selectedIndex = -1;

    for (let i = 0; i < this.queue.length; i += 1) {
      const job = this.queue[i];
      if (this.pausedWorkspaces.has(job.workspaceSlug)) {
        continue;
      }
      const expensive = EXPENSIVE_PROVIDERS.has(job.input.provider.toLowerCase());
      if (expensive && expensiveActive >= this.queueConfig.maxExpensiveRuns) {
        continue;
      }

      const workspaceActive = activeByWorkspace.get(job.workspaceId) ?? 0;
      if (workspaceActive >= this.queueConfig.maxWorkspaceRuns) {
        continue;
      }

      if (selectedIndex === -1) {
        selectedIndex = i;
        continue;
      }

      const current = this.queue[selectedIndex];
      const currentStarved = new Date(current.enqueuedAt).getTime() <= starvationCutoff;
      const candidateStarved = new Date(job.enqueuedAt).getTime() <= starvationCutoff;

      if (candidateStarved && !currentStarved) {
        selectedIndex = i;
        continue;
      }

      if (candidateStarved && currentStarved) {
        if (new Date(job.enqueuedAt).getTime() < new Date(current.enqueuedAt).getTime()) {
          selectedIndex = i;
        }
        continue;
      }

      const currentScore = this.priorityScore(current.priority);
      const candidateScore = this.priorityScore(job.priority);
      if (candidateScore < currentScore) {
        selectedIndex = i;
        continue;
      }
      if (candidateScore === currentScore) {
        if (new Date(job.enqueuedAt).getTime() < new Date(current.enqueuedAt).getTime()) {
          selectedIndex = i;
        }
      }
    }

    if (selectedIndex >= 0) {
      const [job] = this.queue.splice(selectedIndex, 1);
      return job;
    }

    return null;
  }

  private async executeQueuedRun(job: QueueJob): Promise<void> {
    const workspace = this.repo.listWorkspaces().find((ws) => ws.id === job.workspaceId);
    const run = this.repo.getRunById(job.runId);
    if (!workspace || !run) {
      return;
    }

    const abortController = new AbortController();
    this.activeRunControllers.set(job.runId, abortController);

    this.repo.upsertWorkspace(touchWorkspace(workspace, "running"));
    const running: AgentRun = {
      ...run,
      status: "running",
      summary: "Run started",
      cancelReason: null,
      cancelledAt: null,
      endedAt: null,
    };
    this.repo.updateRun(running);
    this.broadcast("run.started", { run: running, queue: this.getQueueState() });

    const adapter = getAdapter(job.input.provider);
    const providerConfig = resolveProviderConfig(job.input.provider, job.input.profile);

    try {
      const result = await adapter.run(
        {
          workspaceId: workspace.id,
          workspacePath: workspace.worktreePath,
          prompt: job.input.prompt,
          provider: job.input.provider,
          providerConfig,
          continueSessionId: running.sessionId ?? undefined,
          parentRunId: running.parentRunId ?? undefined,
          abortSignal: abortController.signal,
        },
        (event) => {
          const savedEvent = this.repo.addEvent({
            runId: running.id,
            workspaceId: workspace.id,
            type: event.type,
            payload: event.payload,
          });
          this.broadcast("run.event", { event: savedEvent });
        }
      );

      if (this.cancelRequestedRuns.has(running.id) || abortController.signal.aborted) {
        this.markRunCancelled(workspace, running, "Cancelled during execution");
        return;
      }

      const completed: AgentRun = {
        ...running,
        status: "completed",
        summary: result.summary,
        sessionId: result.sessionId ?? running.sessionId,
        tokenInput: result.tokenInput,
        tokenOutput: result.tokenOutput,
        costUsd: result.costUsd,
        cancelReason: null,
        cancelledAt: null,
        endedAt: nowIso(),
      };
      this.repo.updateRun(completed);
      this.repo.upsertWorkspace(touchWorkspace(workspace, "active"));

      const notif = this.repo.addNotification({
        workspaceId: workspace.id,
        runId: running.id,
        title: `${workspace.slug} run completed`,
        body: completed.summary,
        action: `silo://workspace/${workspace.slug}/run/${running.id}/logs`,
      });
      this.broadcast("notification", { notification: notif });
      if (!isTestMode()) {
        notify({
          title: notif.title,
          body: `${notif.body}\nActions: Open Logs / Re-run in dashboard`,
        });
      }
      this.broadcast("run.completed", { run: completed });
    } catch (error) {
      if (this.cancelRequestedRuns.has(running.id) || isAbortLikeError(error)) {
        this.markRunCancelled(workspace, running, "Cancelled during execution");
        return;
      }

      const failed: AgentRun = {
        ...running,
        status: "failed",
        summary: error instanceof Error ? error.message : "Unknown run error",
        cancelReason: null,
        cancelledAt: null,
        endedAt: nowIso(),
      };
      this.repo.updateRun(failed);
      this.repo.upsertWorkspace(touchWorkspace(workspace, "error"));

      const notif = this.repo.addNotification({
        workspaceId: workspace.id,
        runId: running.id,
        title: `${workspace.slug} run failed`,
        body: failed.summary,
        action: `silo://workspace/${workspace.slug}/run/${running.id}/logs`,
      });
      this.broadcast("notification", { notification: notif });
      if (!isTestMode()) {
        notify({
          title: notif.title,
          body: `${notif.body}\nActions: Open Logs / Re-run in dashboard`,
        });
      }
      this.broadcast("run.failed", { run: failed });
    } finally {
      this.activeRunControllers.delete(job.runId);
      this.cancelRequestedRuns.delete(job.runId);
    }
  }

  private markRunCancelled(workspace: Workspace, running: AgentRun, reason: string): void {
    const cancelledAt = nowIso();
    const cancelled: AgentRun = {
      ...running,
      status: "cancelled",
      summary: reason,
      cancelReason: reason,
      cancelledAt,
      endedAt: cancelledAt,
    };
    this.repo.updateRun(cancelled);
    this.repo.upsertWorkspace(touchWorkspace(workspace, "active"));

    const event = this.repo.addEvent({
      runId: running.id,
      workspaceId: workspace.id,
      type: "run.cancelled",
      payload: { reason },
    });
    this.broadcast("run.event", { event });

    const notif = this.repo.addNotification({
      workspaceId: workspace.id,
      runId: running.id,
      title: `${workspace.slug} run cancelled`,
      body: reason,
      action: `silo://workspace/${workspace.slug}/run/${running.id}/logs`,
    });
    this.broadcast("notification", { notification: notif });
    if (!isTestMode()) {
      notify({
        title: notif.title,
        body: notif.body,
      });
    }
    this.broadcast("run.cancelled", { run: cancelled });
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const priorityDiff = this.priorityScore(a.priority) - this.priorityScore(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime();
    });
  }

  private priorityScore(priority: QueuePriority): number {
    if (priority === "high") return 0;
    if (priority === "normal") return 1;
    return 2;
  }

  private buildTimelineSteps(events: RunEvent[]): ToolTimelineStep[] {
    const pending = new Map<string, Array<{ ts: string; payload: Record<string, unknown> }>>();
    const steps: ToolTimelineStep[] = [];

    for (const event of events) {
      if (event.type === "tool.started") {
        const tool = readToolName(event.payload);
        const entry = pending.get(tool) ?? [];
        entry.push({ ts: event.ts, payload: event.payload });
        pending.set(tool, entry);
      }

      if (event.type === "tool.finished") {
        const tool = readToolName(event.payload);
        const entry = pending.get(tool) ?? [];
        const start = entry.shift();
        pending.set(tool, entry);

        if (start) {
          const durationMs = new Date(event.ts).getTime() - new Date(start.ts).getTime();
          steps.push({
            tool,
            status: "completed",
            startedAt: start.ts,
            endedAt: event.ts,
            durationMs,
            tokenInput: 0,
            tokenOutput: 0,
            costUsd: 0,
            startPayload: start.payload,
            endPayload: event.payload,
          });
        }
      }
    }

    for (const [tool, list] of pending.entries()) {
      for (const dangling of list) {
        steps.push({
          tool,
          status: "incomplete",
          startedAt: dangling.ts,
          endedAt: null,
          durationMs: null,
          tokenInput: 0,
          tokenOutput: 0,
          costUsd: 0,
          startPayload: dangling.payload,
          endPayload: null,
        });
      }
    }

    return steps.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  }

  private applyUsageRollups(
    steps: ToolTimelineStep[],
    events: RunEvent[],
    run: AgentRun
  ): { steps: ToolTimelineStep[]; rollup: TimelineUsageRollup } {
    const withUsage = steps.map((step) => ({ ...step }));
    const usageEvents = events.filter((event) => event.type === "llm.usage");
    const byTool = new Map<string, { tokenInput: number; tokenOutput: number; costUsd: number; usageEvents: number }>();

    for (const usageEvent of usageEvents) {
      const input = readNumber(usageEvent.payload, "input");
      const output = readNumber(usageEvent.payload, "output");
      const costUsd = readNumber(usageEvent.payload, "costUsd") || readNumber(usageEvent.payload, "cost");
      const stepIndex = this.findStepIndexForUsage(withUsage, usageEvent.ts);
      const tool = stepIndex >= 0 ? withUsage[stepIndex].tool : "unattributed";

      if (stepIndex >= 0) {
        withUsage[stepIndex].tokenInput += input;
        withUsage[stepIndex].tokenOutput += output;
        withUsage[stepIndex].costUsd += costUsd;
      }

      const current = byTool.get(tool) ?? { tokenInput: 0, tokenOutput: 0, costUsd: 0, usageEvents: 0 };
      current.tokenInput += input;
      current.tokenOutput += output;
      current.costUsd += costUsd;
      current.usageEvents += 1;
      byTool.set(tool, current);
    }

    let totalTokenInput = 0;
    let totalTokenOutput = 0;
    let totalCostUsd = 0;
    for (const aggregate of byTool.values()) {
      totalTokenInput += aggregate.tokenInput;
      totalTokenOutput += aggregate.tokenOutput;
      totalCostUsd += aggregate.costUsd;
    }

    if (totalTokenInput === 0 && totalTokenOutput === 0 && totalCostUsd === 0) {
      totalTokenInput = run.tokenInput;
      totalTokenOutput = run.tokenOutput;
      totalCostUsd = run.costUsd;
      if (run.tokenInput > 0 || run.tokenOutput > 0 || run.costUsd > 0) {
        byTool.set("unattributed", {
          tokenInput: run.tokenInput,
          tokenOutput: run.tokenOutput,
          costUsd: run.costUsd,
          usageEvents: usageEvents.length,
        });
      }
    }

    return {
      steps: withUsage,
      rollup: {
        totalTokenInput,
        totalTokenOutput,
        totalCostUsd,
        usageEvents: usageEvents.length,
        byTool: Array.from(byTool.entries())
          .map(([tool, aggregate]) => ({
            tool,
            tokenInput: aggregate.tokenInput,
            tokenOutput: aggregate.tokenOutput,
            costUsd: aggregate.costUsd,
            usageEvents: aggregate.usageEvents,
          }))
          .sort((a, b) => b.tokenInput + b.tokenOutput - (a.tokenInput + a.tokenOutput)),
      },
    };
  }

  private findStepIndexForUsage(steps: ToolTimelineStep[], eventTs: string): number {
    const eventTime = new Date(eventTs).getTime();
    let selected = -1;
    let latestStart = -1;

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const start = new Date(step.startedAt).getTime();
      const end = step.endedAt ? new Date(step.endedAt).getTime() : Number.POSITIVE_INFINITY;
      if (start <= eventTime && eventTime <= end) {
        if (start >= latestStart) {
          latestStart = start;
          selected = index;
        }
      }
    }

    return selected;
  }

  private buildRetryChain(run: AgentRun): RetryChainInfo {
    const workspaceRuns = this.repo.listRuns(run.workspaceId);
    const byId = new Map(workspaceRuns.map((item) => [item.id, item]));

    const ancestorRunIds: string[] = [];
    let cursor = run.parentRunId;
    while (cursor) {
      const parent = byId.get(cursor);
      if (!parent) {
        break;
      }
      ancestorRunIds.unshift(parent.id);
      cursor = parent.parentRunId;
    }

    const childRunIds = workspaceRuns
      .filter((candidate) => candidate.parentRunId === run.id)
      .map((candidate) => candidate.id);

    const descendantRunIds = this.collectDescendantRunIds(run.id, workspaceRuns);
    const rootRunId = ancestorRunIds[0] ?? run.id;

    return {
      rootRunId,
      parentRunId: run.parentRunId,
      childRunIds,
      ancestorRunIds,
      descendantRunIds,
      chainRunIds: [...ancestorRunIds, run.id, ...descendantRunIds],
    };
  }

  private collectDescendantRunIds(runId: string, runs: AgentRun[]): string[] {
    const descendants: string[] = [];
    const queue = [runId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const children = runs.filter((candidate) => candidate.parentRunId === current).map((candidate) => candidate.id);
      descendants.push(...children);
      queue.push(...children);
    }

    return descendants;
  }
}

function parseSiloAction(action: string):
  | { kind: "open-workspace"; workspaceSlug: string }
  | { kind: "open-logs"; workspaceSlug: string; runId: string }
  | { kind: "rerun"; workspaceSlug: string; runId: string }
  | null {
  if (!action.startsWith("silo://")) {
    return null;
  }

  const path = action.replace("silo://", "");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "workspace") {
    return null;
  }

  const workspaceSlug = parts[1];
  if (!workspaceSlug) return null;

  if (parts.length === 2) {
    return { kind: "open-workspace", workspaceSlug };
  }

  if (parts[2] === "run" && parts[3]) {
    const runId = parts[3];
    if (parts[4] === "rerun") {
      return { kind: "rerun", workspaceSlug, runId };
    }
    return { kind: "open-logs", workspaceSlug, runId };
  }

  return { kind: "open-workspace", workspaceSlug };
}

function readToolName(payload: Record<string, unknown>): string {
  const tool = payload.tool;
  return typeof tool === "string" ? tool : "unknown";
}

function readNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("cancelled") || message.includes("aborted");
}
