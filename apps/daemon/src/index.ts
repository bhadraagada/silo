import { handleHttp } from "./http";
import { DaemonState } from "./state";
import { writeDaemonInfo } from "@silo/os-adapters";

const host = process.env.SILO_DAEMON_HOST ?? "127.0.0.1";
const preferredPort = Number(process.env.SILO_DAEMON_PORT ?? "4228");
const maxPortRetries = 10;

function tryKillPort(port: number): void {
  if (process.platform !== "win32") return;
  try {
    const find = Bun.spawnSync(["cmd", "/c", `netstat -ano | findstr :${port} | findstr LISTENING`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = find.stdout.toString();
    const pids = new Set<string>();
    for (const line of output.split("\n")) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== "0") {
        pids.add(pid);
      }
    }
    for (const pid of pids) {
      Bun.spawnSync(["taskkill", "/PID", pid, "/F"], { stdout: "ignore", stderr: "ignore" });
    }
    if (pids.size > 0) {
      Bun.sleepSync(1500);
    }
  } catch {
    // best effort
  }
}

function createServer(state: DaemonState, port: number) {
  return Bun.serve({
    hostname: host,
    port,
    fetch(req, server) {
      const pathname = new URL(req.url).pathname;
      if (pathname === "/ws") {
        if (server.upgrade(req)) {
          return new Response(null);
        }
        return new Response("Upgrade failed", { status: 400 });
      }
      return handleHttp(req, state);
    },
    websocket: {
      open(ws) {
        state.connect(ws);
        ws.send(JSON.stringify({ type: "hello", payload: { service: "silo-daemon" }, ts: new Date().toISOString() }));
      },
      close(ws) {
        state.disconnect(ws);
      },
      message() {
        // no-op for now
      },
    },
  });
}

function startServer(port: number, attempt: number): ReturnType<typeof Bun.serve> {
  const state = new DaemonState({ host, port });

  try {
    const server = createServer(state, port);
    onStarted(server);
    return server;
  } catch (error: unknown) {
    const isPortConflict =
      error instanceof Error && (error.message.includes("EADDRINUSE") || error.message.includes("port"));

    if (isPortConflict && attempt === 0) {
      console.log(`[silo-daemon] port ${port} in use, attempting to kill stale process...`);
      tryKillPort(port);

      try {
        const retry = createServer(state, port);
        onStarted(retry);
        return retry;
      } catch {
        // fall through to port scan
      }
    }

    if (isPortConflict && attempt < maxPortRetries) {
      const nextPort = port + 1;
      console.log(`[silo-daemon] port ${port} still unavailable, trying ${nextPort}...`);
      return startServer(nextPort, attempt + 1);
    }

    throw error;
  }
}

function onStarted(server: ReturnType<typeof Bun.serve>): void {
  const actualPort = server.port ?? preferredPort;
  const url = `http://${host}:${actualPort}`;

  writeDaemonInfo({
    host,
    port: actualPort,
    url,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  console.log(`[silo-daemon] listening on ${url}`);
  if (actualPort !== preferredPort) {
    console.log(`[silo-daemon] preferred port ${preferredPort} was unavailable, using ${actualPort}`);
  }
  console.log(`[silo-daemon] daemon info written to ~/.silo/daemon.json`);
}

startServer(preferredPort, 0);
