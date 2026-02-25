import { describe, expect, test, beforeAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DaemonState } from "../src/state";

type JsonRecord = Record<string, unknown>;

let DaemonStateCtor: { new (config: { host: string; port: number }): DaemonState };
let handleHttpFn: typeof import("../src/http").handleHttp;

beforeAll(async () => {
  process.env.SILO_TEST_MODE = "1";
  process.env.SILO_TERMINAL_BACKEND = "none";
  process.env.SILO_HOME_DIR = mkdtempSync(join(tmpdir(), "silo-daemon-home-"));

  ({ DaemonState: DaemonStateCtor } = await import("../src/state"));
  ({ handleHttp: handleHttpFn } = await import("../src/http"));
});

describe("daemon integration: workspace lifecycle and queue transitions", () => {
  test("creates workspace and completes run lifecycle over HTTP", async () => {
    const repoPath = createTempGitRepo();
    const state = new DaemonStateCtor({ host: "127.0.0.1", port: 0 });

    const workspaceResponse = await callHttp(state, "POST", "/api/workspaces", {
      projectSlug: "daemon-test",
      task: `lifecycle-${Date.now()}`,
      repoPath,
    });

    expect(workspaceResponse.status).toBe(201);
    const workspace = workspaceResponse.body.data as JsonRecord;
    expect(workspace.slug).toBeDefined();

    const runResponse = await callHttp(state, "POST", "/api/runs", {
      workspaceSlug: workspace.slug,
      provider: "mock",
      prompt: "integration lifecycle test",
      priority: "normal",
    });

    expect(runResponse.status).toBe(201);
    const run = runResponse.body.data as JsonRecord;
    expect(run.status).toBe("queued");

    const completedRun = await waitForRunStatus(state, String(run.id), ["completed"]);
    expect(completedRun.status).toBe("completed");

    const timeline = await callHttp(state, "GET", `/api/runs/timeline?runId=${encodeURIComponent(String(run.id))}`);
    expect(timeline.status).toBe(200);
    const timelineData = timeline.body.data as JsonRecord;
    expect((timelineData.steps as unknown[]).length).toBeGreaterThan(0);

    const notifications = await callHttp(
      state,
      "GET",
      `/api/notifications?workspace=${encodeURIComponent(String(workspace.slug))}`
    );
    const list = notifications.body.data as Array<JsonRecord>;
    expect(list.some((item) => String(item.title).includes("run completed"))).toBe(true);

    rmSync(repoPath, { recursive: true, force: true });
  });

  test("supports queue pause/resume and running cancellation", async () => {
    const repoPath = createTempGitRepo();
    const state = new DaemonStateCtor({ host: "127.0.0.1", port: 0 });

    const workspaceResponse = await callHttp(state, "POST", "/api/workspaces", {
      projectSlug: "daemon-test",
      task: `queue-${Date.now()}`,
      repoPath,
    });
    const workspace = workspaceResponse.body.data as JsonRecord;
    const workspaceSlug = String(workspace.slug);

    await callHttp(state, "POST", "/api/queue/config", {
      maxConcurrentRuns: 1,
      maxExpensiveRuns: 1,
    });

    await callHttp(state, "POST", "/api/queue/workspace/pause", { workspaceSlug });
    const pausedRunResponse = await callHttp(state, "POST", "/api/runs", {
      workspaceSlug,
      provider: "mock",
      prompt: "paused queue",
      priority: "normal",
    });
    const pausedRunId = String((pausedRunResponse.body.data as JsonRecord).id);

    await Bun.sleep(120);
    const pausedState = await getRunById(state, pausedRunId);
    expect(pausedState.status).toBe("queued");

    await callHttp(state, "POST", "/api/queue/workspace/resume", { workspaceSlug });
    const resumedState = await waitForRunStatus(state, pausedRunId, ["completed"]);
    expect(resumedState.status).toBe("completed");

    const firstRunResponse = await callHttp(state, "POST", "/api/runs", {
      workspaceSlug,
      provider: "mock",
      prompt: "cancel running 1",
      priority: "normal",
    });
    const firstRunId = String((firstRunResponse.body.data as JsonRecord).id);

    await waitForRunStatus(state, firstRunId, ["running"]);

    const secondRunResponse = await callHttp(state, "POST", "/api/runs", {
      workspaceSlug,
      provider: "mock",
      prompt: "cancel running 2",
      priority: "normal",
    });
    const secondRunId = String((secondRunResponse.body.data as JsonRecord).id);

    const cancelResponse = await callHttp(state, "POST", "/api/queue/workspace/cancel", { workspaceSlug });
    expect(cancelResponse.status).toBe(200);
    const cancelData = cancelResponse.body.data as JsonRecord;
    expect(Number(cancelData.cancelledQueuedRuns)).toBeGreaterThanOrEqual(1);
    expect(Boolean(cancelData.runningCancellationRequested)).toBe(true);

    const cancelledOne = await waitForRunStatus(state, firstRunId, ["cancelled"]);
    const cancelledTwo = await waitForRunStatus(state, secondRunId, ["cancelled"]);
    expect(cancelledOne.status).toBe("cancelled");
    expect(cancelledTwo.status).toBe("cancelled");

    rmSync(repoPath, { recursive: true, force: true });
  });
});

async function callHttp(
  state: DaemonState,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: JsonRecord }> {
  const req = new Request(`http://127.0.0.1:4228${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const response = await handleHttpFn(req, state);
  const payload = (await response.json()) as JsonRecord;
  return {
    status: response.status,
    body: payload,
  };
}

async function getRunById(
  state: DaemonState,
  runId: string
): Promise<JsonRecord> {
  const response = await callHttp(state, "GET", "/api/runs");
  const runs = response.body.data as Array<JsonRecord>;
  const run = runs.find((item) => String(item.id) === runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }
  return run;
}

async function waitForRunStatus(
  state: DaemonState,
  runId: string,
  targetStatuses: string[],
  timeoutMs = 6000
): Promise<JsonRecord> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const run = await getRunById(state, runId);
    if (targetStatuses.includes(String(run.status))) {
      return run;
    }
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for run ${runId} to reach [${targetStatuses.join(", ")}].`);
}

function createTempGitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "silo-daemon-repo-"));
  runGit(root, ["init"]);
  runGit(root, ["config", "user.email", "silo-tests@example.com"]);
  runGit(root, ["config", "user.name", "silo-tests"]);
  writeFileSync(join(root, "README.md"), "# test repo\n", "utf8");
  runGit(root, ["add", "README.md"]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

function runGit(cwd: string, args: string[]): void {
  const command = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (command.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${command.stderr.toString() || command.stdout.toString()}`);
  }
}
