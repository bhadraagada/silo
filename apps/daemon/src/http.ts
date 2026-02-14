import {
  actionExecuteSchema,
  providerDefaultSchema,
  providerSetSchema,
  providerValidateSchema,
  queueConfigSchema,
  queueWorkspaceSchema,
  reviewWorkspaceSchema,
  runWorkspaceSchema,
  shipWorkspaceSchema,
  upWorkspaceSchema,
} from "@silo/core";
import type { DaemonState } from "./state";

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...(init?.headers ?? {}),
    },
  });
}

function readPathname(req: Request): string {
  return new URL(req.url).pathname;
}

export async function handleHttp(req: Request, state: DaemonState): Promise<Response> {
  const pathname = readPathname(req);
  const method = req.method.toUpperCase();

  try {
    if (method === "OPTIONS") {
      return json({ ok: true });
    }

    if (pathname === "/health") {
      return json({ ok: true, service: "silo-daemon" });
    }

    if (pathname === "/api/workspaces" && method === "GET") {
      return json({ data: state.listWorkspaces() });
    }

    if (pathname === "/api/workspaces" && method === "POST") {
      const body = await req.json();
      const input = upWorkspaceSchema.parse(body);
      const workspace = state.upWorkspace(input);
      return json({ data: workspace }, { status: 201 });
    }

    if (pathname.startsWith("/api/workspaces/") && pathname.endsWith("/switch") && method === "POST") {
      const [, , , slug] = pathname.split("/");
      const workspace = state.switchWorkspace(slug);
      return json({ data: workspace });
    }

    if (pathname === "/api/runs" && method === "GET") {
      const url = new URL(req.url);
      const workspace = url.searchParams.get("workspace") ?? undefined;
      return json({ data: state.listRuns(workspace) });
    }

    if (pathname === "/api/runs" && method === "POST") {
      const body = await req.json();
      const input = runWorkspaceSchema.parse(body);
      const run = await state.runWorkspace(input);
      return json({ data: run }, { status: 201 });
    }

    if (pathname === "/api/events" && method === "GET") {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId") ?? undefined;
      return json({ data: state.listEvents(runId) });
    }

    if (pathname === "/api/notifications" && method === "GET") {
      const url = new URL(req.url);
      const workspace = url.searchParams.get("workspace") ?? undefined;
      return json({ data: state.listNotifications(workspace) });
    }

    if (pathname === "/api/review" && method === "GET") {
      const url = new URL(req.url);
      const workspaceSlug = url.searchParams.get("workspace") ?? "";
      const input = reviewWorkspaceSchema.parse({ workspaceSlug });
      const provider = url.searchParams.get("provider") ?? undefined;
      const profile = url.searchParams.get("profile") ?? undefined;
      return json({ data: await state.reviewWorkspace(input.workspaceSlug, { provider, profile }) });
    }

    if (pathname === "/api/ship" && method === "POST") {
      const body = await req.json();
      const input = shipWorkspaceSchema.parse(body);
      return json({ data: state.shipWorkspace(input) });
    }

    if (pathname === "/api/gateway/sync" && method === "POST") {
      return json({ data: state.syncGateway() });
    }

    if (pathname === "/api/providers" && method === "GET") {
      return json({ data: state.getProviderProfiles() });
    }

    if (pathname === "/api/providers/default" && method === "POST") {
      const body = await req.json();
      const input = providerDefaultSchema.parse(body);
      return json({ data: state.useProviderProfile(input.profile) });
    }

    if (pathname === "/api/providers" && method === "POST") {
      const body = await req.json();
      const input = providerSetSchema.parse(body);
      return json({ data: state.setProviderProfile(input.profile, input.provider, input.settings) });
    }

    if (pathname === "/api/providers/validate" && method === "POST") {
      const body = await req.json();
      const input = providerValidateSchema.parse(body);
      return json({ data: await state.validateProviderProfiles(input.profile) });
    }

    if (pathname === "/api/runs/timeline" && method === "GET") {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId");
      if (!runId) {
        return json({ error: "runId is required" }, { status: 400 });
      }
      return json({ data: state.getRunTimeline(runId) });
    }

    if (pathname === "/api/queue" && method === "GET") {
      return json({ data: state.getQueueState() });
    }

    if (pathname === "/api/queue/config" && method === "POST") {
      const body = await req.json();
      const input = queueConfigSchema.parse(body);
      return json({ data: state.setQueueConfig(input) });
    }

    if (pathname === "/api/queue/workspace/pause" && method === "POST") {
      const body = await req.json();
      const input = queueWorkspaceSchema.parse(body);
      return json({ data: state.pauseWorkspaceQueue(input.workspaceSlug) });
    }

    if (pathname === "/api/queue/workspace/resume" && method === "POST") {
      const body = await req.json();
      const input = queueWorkspaceSchema.parse(body);
      return json({ data: state.resumeWorkspaceQueue(input.workspaceSlug) });
    }

    if (pathname === "/api/queue/workspace/cancel" && method === "POST") {
      const body = await req.json();
      const input = queueWorkspaceSchema.parse(body);
      return json({ data: state.cancelWorkspaceRuns(input.workspaceSlug) });
    }

    if (pathname === "/api/actions/execute" && method === "POST") {
      const body = await req.json();
      const input = actionExecuteSchema.parse(body);
      return json({ data: state.executeAction(input.action) });
    }

    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return json({ error: message }, { status: 400 });
  }
}
