import { resolveDaemonUrl } from "@silo/os-adapters";

type JsonRecord = Record<string, unknown>;

const daemonBase = resolveDaemonUrl();

async function request(path: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(`${daemonBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function printHelp(): void {
  console.log(`silo commands:

  silo up <project> --task "task-name" [--repo /path/to/repo]
  silo list
  silo switch <workspace-slug>
  silo run <workspace-slug> --prompt "do something" [--provider mock] [--profile default] [--priority high|normal|low]
  silo continue <run-id> --prompt "follow-up prompt" [--priority high|normal|low]
  silo runs [--workspace <workspace-slug>]
  silo events [--run <run-id>]
  silo notifications [--workspace <workspace-slug>]
  silo review <workspace-slug>
  silo ship <workspace-slug> --message "commit message" [--no-checks] [--open-pr]
  silo action <silo://...>
  silo gateway sync
  silo profiles show
  silo profiles use <profile-name>
  silo profiles set <profile-name> --provider <provider> --settings '{"model":"..."}'
  silo profiles validate [--profile <profile-name>]
  silo queue show
  silo queue config [--max-concurrent <n>] [--max-expensive <n>]
  silo queue pause <workspace-slug>
  silo queue resume <workspace-slug>
  silo queue cancel <workspace-slug>
`);
}

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "up") {
    const projectSlug = rest[0];
    const task = getArg("--task");
    const repoPath = getArg("--repo");
    if (!projectSlug || !task) {
      throw new Error("Usage: silo up <project> --task \"task-name\" [--repo /path/to/repo]");
    }

    const payload = await request("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ projectSlug, task, repoPath }),
    });
    output(payload.data);
    return;
  }

  if (command === "list") {
    const payload = await request("/api/workspaces");
    output(payload.data);
    return;
  }

  if (command === "switch") {
    const slug = rest[0];
    if (!slug) {
      throw new Error("Usage: silo switch <workspace-slug>");
    }
    const payload = await request(`/api/workspaces/${slug}/switch`, { method: "POST" });
    output(payload.data);
    return;
  }

  if (command === "run") {
    const workspaceSlug = rest[0];
    const prompt = getArg("--prompt");
    const provider = getArg("--provider") ?? "mock";
    const profile = getArg("--profile");
    const priority = getArg("--priority") ?? "normal";
    if (!workspaceSlug || !prompt) {
      throw new Error(
        "Usage: silo run <workspace-slug> --prompt \"do something\" [--provider mock] [--profile default] [--priority high|normal|low]"
      );
    }

    const payload = await request("/api/runs", {
      method: "POST",
      body: JSON.stringify({ workspaceSlug, provider, prompt, profile, priority }),
    });
    output(payload.data);
    return;
  }

  if (command === "continue") {
    const continueRunId = rest[0];
    const prompt = getArg("--prompt");
    const priority = getArg("--priority") ?? "normal";
    if (!continueRunId || !prompt) {
      throw new Error("Usage: silo continue <run-id> --prompt \"follow-up prompt\" [--priority high|normal|low]");
    }

    // Look up the original run to get workspace and provider
    const [runLookup, workspaceLookup] = await Promise.all([
      request("/api/runs"),
      request("/api/workspaces"),
    ]);
    const runs = runLookup.data as Array<JsonRecord>;
    const workspaces = workspaceLookup.data as Array<JsonRecord>;
    const parentRun = runs.find((r: JsonRecord) => r.id === continueRunId);
    if (!parentRun) {
      throw new Error(`Run not found: ${continueRunId}`);
    }
    const workspace = workspaces.find((w: JsonRecord) => w.id === parentRun.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found for run: ${continueRunId}`);
    }

    const payload = await request("/api/runs", {
      method: "POST",
      body: JSON.stringify({
        workspaceSlug: workspace.slug,
        provider: parentRun.provider,
        prompt,
        priority,
        continueRunId,
      }),
    });
    output(payload.data);
    return;
  }

  if (command === "review") {
    const workspaceSlug = rest[0];
    const provider = getArg("--provider");
    const profile = getArg("--profile");
    if (!workspaceSlug) {
      throw new Error("Usage: silo review <workspace-slug>");
    }
    const params = new URLSearchParams({ workspace: workspaceSlug });
    if (provider) params.set("provider", provider);
    if (profile) params.set("profile", profile);
    const payload = await request(`/api/review?${params.toString()}`);
    output(payload.data);
    return;
  }

  if (command === "ship") {
    const workspaceSlug = rest[0];
    const commitMessage = getArg("--message");
    const openPr = process.argv.includes("--open-pr");
    const runChecks = !process.argv.includes("--no-checks");
    if (!workspaceSlug || !commitMessage) {
      throw new Error(
        "Usage: silo ship <workspace-slug> --message \"commit message\" [--no-checks] [--open-pr]"
      );
    }
    const payload = await request("/api/ship", {
      method: "POST",
      body: JSON.stringify({ workspaceSlug, commitMessage, runChecks, openPr }),
    });
    output(payload.data);
    return;
  }

  if (command === "gateway") {
    const sub = rest[0];
    if (sub === "sync") {
      const payload = await request("/api/gateway/sync", { method: "POST" });
      output(payload.data);
      return;
    }
    throw new Error("Usage: silo gateway sync");
  }

  if (command === "action") {
    const action = rest[0];
    if (!action) {
      throw new Error("Usage: silo action <silo://...>");
    }
    const payload = await request("/api/actions/execute", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    output(payload.data);
    return;
  }

  if (command === "profiles") {
    const sub = rest[0];
    if (sub === "show") {
      const payload = await request("/api/providers");
      output(payload.data);
      return;
    }
    if (sub === "use") {
      const profile = rest[1];
      if (!profile) {
        throw new Error("Usage: silo profiles use <profile-name>");
      }
      const payload = await request("/api/providers/default", {
        method: "POST",
        body: JSON.stringify({ profile }),
      });
      output(payload.data);
      return;
    }
    if (sub === "set") {
      const profile = rest[1];
      const provider = getArg("--provider");
      const settingsRaw = getArg("--settings");
      if (!profile || !provider || !settingsRaw) {
        throw new Error(
          "Usage: silo profiles set <profile-name> --provider <provider> --settings '{\"model\":\"...\"}'"
        );
      }
      const settings = JSON.parse(settingsRaw);
      const payload = await request("/api/providers", {
        method: "POST",
        body: JSON.stringify({ profile, provider, settings }),
      });
      output(payload.data);
      return;
    }
    if (sub === "validate") {
      const profile = getArg("--profile");
      const payload = await request("/api/providers/validate", {
        method: "POST",
        body: JSON.stringify({ profile }),
      });
      output(payload.data);
      return;
    }
    throw new Error("Usage: silo profiles <show|use|set|validate>");
  }

  if (command === "queue") {
    const sub = rest[0];
    if (sub === "show") {
      const payload = await request("/api/queue");
      output(payload.data);
      return;
    }
    if (sub === "config") {
      const maxConcurrent = getArg("--max-concurrent");
      const maxExpensive = getArg("--max-expensive");
      const payload = await request("/api/queue/config", {
        method: "POST",
        body: JSON.stringify({
          maxConcurrentRuns: maxConcurrent ? Number(maxConcurrent) : undefined,
          maxExpensiveRuns: maxExpensive ? Number(maxExpensive) : undefined,
        }),
      });
      output(payload.data);
      return;
    }
    if (sub === "pause") {
      const workspaceSlug = rest[1];
      if (!workspaceSlug) throw new Error("Usage: silo queue pause <workspace-slug>");
      const payload = await request("/api/queue/workspace/pause", {
        method: "POST",
        body: JSON.stringify({ workspaceSlug }),
      });
      output(payload.data);
      return;
    }
    if (sub === "resume") {
      const workspaceSlug = rest[1];
      if (!workspaceSlug) throw new Error("Usage: silo queue resume <workspace-slug>");
      const payload = await request("/api/queue/workspace/resume", {
        method: "POST",
        body: JSON.stringify({ workspaceSlug }),
      });
      output(payload.data);
      return;
    }
    if (sub === "cancel") {
      const workspaceSlug = rest[1];
      if (!workspaceSlug) throw new Error("Usage: silo queue cancel <workspace-slug>");
      const payload = await request("/api/queue/workspace/cancel", {
        method: "POST",
        body: JSON.stringify({ workspaceSlug }),
      });
      output(payload.data);
      return;
    }
    throw new Error("Usage: silo queue <show|config|pause|resume|cancel>");
  }

  if (command === "runs") {
    const workspace = getArg("--workspace");
    const suffix = workspace ? `?workspace=${encodeURIComponent(workspace)}` : "";
    const payload = await request(`/api/runs${suffix}`);
    output(payload.data);
    return;
  }

  if (command === "events") {
    const run = getArg("--run");
    const suffix = run ? `?runId=${encodeURIComponent(run)}` : "";
    const payload = await request(`/api/events${suffix}`);
    output(payload.data);
    return;
  }

  if (command === "notifications") {
    const workspace = getArg("--workspace");
    const suffix = workspace ? `?workspace=${encodeURIComponent(workspace)}` : "";
    const payload = await request(`/api/notifications${suffix}`);
    output(payload.data);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  console.error(`[silo-cli] ${message}`);
  process.exit(1);
});
