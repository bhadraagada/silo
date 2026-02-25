# silo

`silo` is a local, project-centric workspace orchestrator for parallel agentic software development.

## What it does

- Worktree-per-task isolation
- Browser profile-per-workspace isolation
- Deterministic domain/port allocation
- Run/event tracking for agent executions
- Actionable notifications and workspace switching

## Monorepo layout

- `apps/cli`: `silo` command line interface
- `apps/daemon`: local control plane and API
- `apps/dashboard`: local UI for workspaces, runs, and events
- `packages/*`: shared libraries (core, db, adapters, git, gateway)

## Quickstart

1. Install dependencies:
   - `bun install`
2. Start daemon:
   - `bun run daemon`
3. In another terminal, use CLI:
   - `bun run cli -- up demo --task "first-task"`

## Core commands

- `bun run cli -- up <project> --task "..." [--repo path]`
- `bun run cli -- run <workspace-slug> --prompt "..." [--provider mock|openai|claude-api|codex|claude|opencode]`
- `bun run cli -- run <workspace-slug> --prompt "..." [--provider ...] [--profile default] [--priority high|normal|low]`
- `bun run cli -- review <workspace-slug> [--provider openai|claude-api] [--profile default]`
- `bun run cli -- ship <workspace-slug> --message "..." [--no-checks] [--open-pr]`
- `bun run cli -- action <silo://...>`
- `bun run cli -- gateway sync`
- `bun run cli -- profiles show`
- `bun run cli -- profiles use <profile-name>`
- `bun run cli -- profiles set <profile-name> --provider <provider> --settings '{"model":"..."}'`
- `bun run cli -- profiles validate [--profile <name>]`
- `bun run cli -- queue show`
- `bun run cli -- queue config [--max-concurrent <n>] [--max-expensive <n>]`
- `bun run cli -- queue pause <workspace-slug>`
- `bun run cli -- queue resume <workspace-slug>`
- `bun run cli -- queue cancel <workspace-slug>`

## Provider setup

- OpenAI API adapter:
  - default profile reads `OPENAI_API_KEY`
- Anthropic API adapter:
  - default profile reads `ANTHROPIC_API_KEY`
- Command-based adapters:
  - configure `command` and `args` in provider profile

Provider profiles live in `~/.silo/providers.json` and can store per-provider model, command args,
and key env mapping.

When setting `apiKey` via `silo profiles set ... --settings`, silo stores the key in an OS-backed
secure store (macOS Keychain, Linux keyring via `secret-tool`, Windows DPAPI-protected local store)
and writes only an `apiKeyRef` pointer in `providers.json`.

`profiles validate` performs provider health checks including key resolution, CLI binary availability,
and small connectivity checks against provider APIs.

### Execution policy

- Runtime uses YOLO execution policy by default for agent runs (avoid permission-seeking loops).
- API adapters prepend a non-interactive instruction to execute directly.
- Command adapters pass `SILO_APPROVAL_POLICY=never` and `SILO_YOLO_MODE=1` env vars.

For command providers, default profile args are configured for non-interactive execution:

- `codex`: `exec --dangerously-bypass-approvals-and-sandbox {prompt}`
- `claude`: `-p {prompt} --allow-dangerously-skip-permissions --dangerously-skip-permissions --permission-mode bypassPermissions`
- `opencode`: `run --format json {prompt}`

You can override args per profile with `silo profiles set ... --settings`.

## Gateway output

- Generated local routing configs are written to:
  - `~/.silo/gateway/Caddyfile`
  - `~/.silo/gateway/traefik.dynamic.yml`
- Optional reload hooks:
  - `SILO_AUTO_RELOAD_CADDY=1` to run `caddy reload --config <file>`
  - `SILO_CADDY_RELOAD_CMD="..."` to customize caddy reload command
  - `SILO_TRAEFIK_RELOAD_CMD="..."` to run custom traefik reload command (`{file}` placeholder supported)

## Run queue and timeline

- Daemon includes a scheduler with priorities (`high`, `normal`, `low`) and concurrency controls.
- Supports workspace queue pause/resume/cancel and expensive-provider throttling.
- Queue cancel aborts active workspace runs (best effort) and marks them `cancelled`.
- Dashboard shows replay/debug timeline per run by pairing `tool.started` and `tool.finished` events.
- In dashboard dev mode only, an extra `cli.exec` debug panel is shown for command-provider runs.

## Terminal session orchestration

- `switch`/`up` now attempt terminal session routing through tmux/zellij adapters.
- Backend selection uses `SILO_TERMINAL_BACKEND` with values `auto` (default), `tmux`, `zellij`, `none`.
- `auto` prefers `tmux` first, then `zellij`, and safely no-ops if neither is installed.
- tmux integration ensures a per-workspace session exists and switches client when running inside tmux.

## Current status

This repository contains a production-oriented scaffold and working MVP flows for local workspace orchestration.

## Testing

Use `TESTING.md` for the full end-to-end validation checklist.

Automated unit tests live in package-level `tests/` folders (for example,
`packages/core/tests`). Run all tests with:

- `bun run test`

## Open source

- License: MIT (`LICENSE`)
- Contributing guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`

GitHub CI is configured in `.github/workflows/ci.yml`.
