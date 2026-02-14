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
and key env mapping (or direct key where needed).

`profiles validate` performs provider health checks including key resolution, CLI binary availability,
and small connectivity checks against provider APIs.

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
- Dashboard shows replay/debug timeline per run by pairing `tool.started` and `tool.finished` events.

## Current status

This repository contains a production-oriented scaffold and working MVP flows for local workspace orchestration.

## Testing

Use `TESTING.md` for the full end-to-end validation checklist.
