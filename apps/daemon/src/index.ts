import { handleHttp } from "./http";
import { DaemonState } from "./state";

const host = process.env.SILO_DAEMON_HOST ?? "127.0.0.1";
const port = Number(process.env.SILO_DAEMON_PORT ?? "4228");
const state = new DaemonState({ host, port });

const server = Bun.serve({
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

console.log(`[silo-daemon] listening on http://${host}:${server.port}`);
