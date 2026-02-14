# silo Testing Guide

This document is the canonical manual test plan for `silo`.

If command behavior, APIs, or workflows change, update this file in the same change.

## Prerequisites

- `bun` installed
- `git` installed
- optional: `gh` (for PR flow)
- optional provider credentials:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`

## 1) Start services

From repo root:

```bash
bun install
bun run daemon
```

In another terminal:

```bash
bun run --cwd apps/dashboard dev
```

In a third terminal:

```bash
bun run cli -- --help
```

Dashboard URL is printed by Vite (usually `http://localhost:4230`).

## 2) Prepare a test git repo

`silo up` expects a git repo (worktrees are used).

```bash
mkdir test-silo-repo
cd test-silo-repo
git init
echo "# test" > README.md
git add .
git commit -m "init"
```

Use absolute path of this repo in `--repo`.

## 3) Workspace lifecycle checks

```bash
bun run cli -- up demo --task "first flow" --repo "/absolute/path/to/test-silo-repo"
bun run cli -- list
bun run cli -- switch demo-first-flow
```

Verify:

- worktree exists at `<repo>/.silo/worktrees/<workspace-slug>`
- browser profile is isolated
- workspace appears in dashboard

## 4) Provider profiles + validation

```bash
bun run cli -- profiles show
bun run cli -- profiles validate
```

Example OpenAI profile setup:

```bash
bun run cli -- profiles set default --provider openai --settings '{"apiKeyEnv":"OPENAI_API_KEY","model":"gpt-4.1-mini"}'
bun run cli -- profiles validate --profile default
```

Example Anthropic profile setup:

```bash
bun run cli -- profiles set default --provider claude-api --settings '{"apiKeyEnv":"ANTHROPIC_API_KEY","model":"claude-3-7-sonnet-latest","maxTokens":1200}'
bun run cli -- profiles validate --profile default
```

CLI provider example:

```bash
bun run cli -- profiles set default --provider codex --settings '{"command":"codex","args":[]}'
bun run cli -- profiles validate --profile default
```

## 5) Queue + concurrency controls

Queue runs with different priorities:

```bash
bun run cli -- run demo-first-flow --provider mock --prompt "task low" --priority low
bun run cli -- run demo-first-flow --provider mock --prompt "task high" --priority high
bun run cli -- run demo-first-flow --provider mock --prompt "task normal" --priority normal
```

Inspect and control queue:

```bash
bun run cli -- queue show
bun run cli -- queue config --max-concurrent 2 --max-expensive 1
bun run cli -- queue pause demo-first-flow
bun run cli -- queue resume demo-first-flow
bun run cli -- queue cancel demo-first-flow
```

## 6) Timeline + actions + notification flows

List runs and events:

```bash
bun run cli -- runs --workspace demo-first-flow
bun run cli -- events --run <run-id>
```

Action URI tests:

```bash
bun run cli -- action "silo://workspace/demo-first-flow"
bun run cli -- action "silo://workspace/demo-first-flow/run/<run-id>/logs"
bun run cli -- action "silo://workspace/demo-first-flow/run/<run-id>/rerun"
```

Dashboard checks:

- select run in timeline dropdown
- verify tool step durations and ordering
- use notification action buttons (`Open`, `Re-run`)

## 7) Review intelligence + ship

Make at least one file change in the workspace worktree, then run:

```bash
bun run cli -- review demo-first-flow
```

Optional LLM-assisted review:

```bash
bun run cli -- review demo-first-flow --provider openai --profile default
```

Ship flow:

```bash
bun run cli -- ship demo-first-flow --message "test ship flow"
```

PR flow (requires `gh` auth and remote):

```bash
bun run cli -- ship demo-first-flow --message "test ship with pr" --open-pr
```

## 8) Gateway sync + reload hooks

```bash
bun run cli -- gateway sync
```

Verify files:

- `~/.silo/gateway/Caddyfile`
- `~/.silo/gateway/traefik.dynamic.yml`

Optional hook env vars:

- `SILO_AUTO_RELOAD_CADDY=1`
- `SILO_CADDY_RELOAD_CMD="..."`
- `SILO_TRAEFIK_RELOAD_CMD="..."` (supports `{file}` placeholder)

## Quick sanity checks

From monorepo root:

```bash
bun run typecheck
bun run test
bun run build
```

If both pass and sections above work, end-to-end flow is healthy.
