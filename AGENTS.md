# AGENTS.md

Operational memory for building and extending `silo`.

## Product intent

`silo` treats a workspace as the primary unit of development:

- project
- git worktree
- branch
- browser profile
- terminal session
- agent runs and events

## UX principles

1. One task = one workspace = one worktree.
2. Every run must be traceable by workspace and run id.
3. Notifications must include jump targets.
4. Switching workspaces should be deterministic and fast.
5. Never depend on random localhost behavior for identity.

## Initial architecture

- `apps/daemon`: source of truth for state and orchestration.
- `apps/cli`: user entrypoint for all commands.
- `apps/dashboard`: live visibility into workspace and run lifecycle.
- `packages/db`: SQLite schema + repositories.
- `packages/core`: domain types + lifecycle orchestration.
- `packages/os-adapters`: opens editor/browser and sends notifications.
- `packages/git`: worktree and branch ops.
- `packages/agent-adapters`: provider abstraction and normalized events.
- `packages/gateway`: workspace URL and local routing utilities.

## Naming conventions

- Workspace slug: `<project>-<task>` (safe lowercase slug)
- Branch: `silo/<task-slug>`
- Domain: `<workspace-slug>.dev.local`

## Notes log

- 2026-02-11: Created initial monorepo plan and implementation scaffold.
- 2026-02-11: Implemented bun + turbo monorepo with apps (`cli`, `daemon`, `dashboard`) and package boundaries.
- 2026-02-11: Added SQLite repository and schema for projects, workspaces, runs, events, and notifications.
- 2026-02-11: Added daemon HTTP API + websocket stream for live dashboard updates.
- 2026-02-11: Added CLI commands for workspace lifecycle and run/event/notification inspection.
- 2026-02-11: Added dashboard MVP with workspace/run/event/notification panels.
- 2026-02-11: Replaced mock-only adapter path with real provider adapters (OpenAI, Anthropic, Codex/Claude/OpenCode CLI).
- 2026-02-11: Added `review` and `ship` workflows with git diff/status/log snapshots and commit/check automation.
- 2026-02-11: Added gateway config writer for Caddy/Traefik with auto-sync on workspace lifecycle changes.
- 2026-02-11: Added provider profile config (`~/.silo/providers.json`) with default profile selection and per-provider settings.
- 2026-02-11: Added gateway reload hook support via `SILO_AUTO_RELOAD_CADDY`, `SILO_CADDY_RELOAD_CMD`, and `SILO_TRAEFIK_RELOAD_CMD`.
- 2026-02-11: Added `profiles validate` health checks for API keys, provider connectivity, and CLI binary presence.
- 2026-02-11: Added run scheduler queue with priorities, concurrency caps, workspace pause/resume/cancel, and expensive-provider throttling.
- 2026-02-11: Added action execution endpoint (`silo://...`) for open workspace, open logs, and rerun flows.
- 2026-02-11: Added review intelligence output (risk hotspots, regressions, tests, commit/PR drafts) with optional LLM assist.
- 2026-02-11: Added dashboard run timeline replay from tool events and queue controls.
- 2026-02-11: Added `TESTING.md` as the canonical end-to-end manual validation guide.
- 2026-02-11: Added standalone `web` Vite+React+TS+Tailwind marketing app for `silo` with five creative route variants (`/1` to `/5`) on port `4000`.
- 2026-02-14: Added DB migration support for existing databases (`ALTER TABLE` for `session_id`, `parent_run_id` columns).
- 2026-02-14: Added `silo continue <run-id> --prompt "..."` CLI command for session continuation.
- 2026-02-14: Added initial terminal session orchestration via tmux/zellij-aware adapter routing on workspace up/switch.
- 2026-02-25: Upgraded workspace queue cancel to abort active runs (command and API adapters) and persist `cancelled` status.
- 2026-02-12: Expanded `web` landing pages to 10 brutalist-style variants (`/1` to `/10`), each with distinct aesthetic and messaging:
  - `/1`: Signal Brutalist (warm, raw control aesthetic)
  - `/2`: Neon Terminal (neon cyan/teal cyberpunk vibes)
  - `/3`: Editorial Atlas (clean, high-contrast monochrome)
  - `/4`: Blueprint Ops (soft blue infrastructure thinking)
  - `/5`: Soft Machine (gentle pastels with rounded corners)
  - `/6`: System Grid (dark green-on-black grid logic)
  - `/7`: Concrete Void (minimal white brutalism, sparse form)
  - `/8`: Chrome Pulse (dark orange/gold industrial intensity)
  - `/9`: Archive Black (pure monochrome black/white documentation)
  - `/10`: Modular Stack (layered dark blue/pink protocol stack)

## Current implementation snapshot

### Workspace lifecycle

- `silo up <project> --task "..." [--repo path]`
  - resolves git root
  - creates/uses worktree at `<repo>/.silo/worktrees/<workspace-slug>`
  - creates deterministic branch `silo/<task-slug>`
  - allocates deterministic app/api ports from workspace slug hash
  - assigns domain `<workspace-slug>.dev.local`
  - launches editor and isolated browser profile

### Agent run lifecycle

- `silo run <workspace-slug> --prompt "..." [--provider mock] [--profile <name>]`
  - supports queue priority (`high|normal|low`)
  - creates `runs` row
  - streams normalized events (`run.started`, `tool.*`, `llm.usage`, `run.completed`)
  - stores event payload JSON in `run_events`
  - sends completion/failure notification with action URI

### Review and ship lifecycle

- `silo review <workspace-slug>`
  - captures workspace git branch
  - returns porcelain status, diff, recent commits, and changed files
  - generates review intelligence: risk hotspots, likely regressions, test recommendations, commit/PR draft text
- `silo ship <workspace-slug> --message "..." [--no-checks] [--open-pr]`
  - optionally runs `bun run typecheck`, `bun run test`, `bun run build`
  - stages all, commits, returns commit sha
  - optionally opens PR via `gh pr create`

### Domain gateway outputs

- Writes generated routes to:
  - `~/.silo/gateway/Caddyfile`
  - `~/.silo/gateway/traefik.dynamic.yml`
- Auto-sync runs on workspace create/switch and via explicit `gateway sync`.
- Optional process hooks run post-sync for caddy/traefik reload commands.

### Provider profile config

- Provider settings file: `~/.silo/providers.json`
- Contains profile set, default profile, and per-provider options:
  - `openai`: `apiKey`/`apiKeyEnv`, `model`
  - `claude-api`: `apiKey`/`apiKeyEnv`, `model`, `maxTokens`
  - `codex`/`claude`/`opencode`: `command`, `args`
- CLI supports showing profiles, changing default, and setting provider settings.
- `profiles validate` checks key resolution, CLI binary availability, and API connectivity.

### Run queue and control plane

- Queue supports priority ordering (`high`, `normal`, `low`).
- Configurable caps:
  - `maxConcurrentRuns`
  - `maxExpensiveRuns` for expensive providers (`openai`, `claude-api`/`anthropic`)
- Workspace controls:
  - pause queue intake
  - resume queue intake
  - cancel queued runs and actively abort running runs (best effort)
- Run action URIs can be executed by API/CLI (`open workspace`, `open logs`, `rerun`).

### Determinism and isolation guarantees

- One workspace has one slug, branch, domain, worktree path, and profile directory.
- Browser profile path is persisted and reused on `switch`.
- Ports are deterministic for a workspace slug (stable across restarts).
- Run history is immutable event log + mutable run summary state.

## API surface (daemon)

- `GET /health`
- `GET /api/workspaces`
- `POST /api/workspaces`
- `POST /api/workspaces/:slug/switch`
- `GET /api/runs?workspace=<slug>`
- `POST /api/runs`
- `GET /api/events?runId=<run-id>`
- `GET /api/notifications?workspace=<slug>`
- `GET /api/review?workspace=<slug>`
- `POST /api/ship`
- `POST /api/gateway/sync`
- `GET /api/providers`
- `POST /api/providers/default`
- `POST /api/providers`
- `POST /api/providers/validate`
- `GET /api/runs/timeline?runId=<run-id>`
- `GET /api/queue`
- `POST /api/queue/config`
- `POST /api/queue/workspace/pause`
- `POST /api/queue/workspace/resume`
- `POST /api/queue/workspace/cancel`
- `POST /api/actions/execute`
- `WS /ws` live event stream

## CLI surface (current)

- `silo up`
- `silo list`
- `silo switch`
- `silo run`
- `silo continue`
- `silo runs`
- `silo events`
- `silo notifications`
- `silo review`
- `silo ship`
- `silo gateway sync`
- `silo profiles show`
- `silo profiles use`
- `silo profiles set`
- `silo profiles validate`
- `silo queue show`
- `silo queue config`
- `silo queue pause`
- `silo queue resume`
- `silo queue cancel`
- `silo action`

## Operational commands

- Install: `bun install`
- Typecheck: `bun run typecheck`
- Build: `bun run build`
- Start daemon: `bun run daemon`
- Use CLI in another terminal: `bun run cli -- <command>`
- Dashboard dev: `bun run --cwd apps/dashboard dev`

## Next build priorities

1. Add true terminal session orchestration (tmux/zellij integration).
2. Add native notification button click handlers with OS-specific deep-link callbacks.
3. Add integration tests for end-to-end workspace lifecycle and queue state transitions.
4. Add secure provider credential storage (keychain integration) and encrypted at-rest secrets.
5. Add richer timeline annotations (files touched per tool step, retry chain linking, cost per step).
