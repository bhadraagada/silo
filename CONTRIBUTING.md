# Contributing to silo

Thanks for contributing.

## Development setup

1. Install Bun and Git.
2. Install dependencies:
   - `bun install`
3. Run local checks from repo root:
   - `bun run typecheck`
   - `bun run test`
   - `bun run build`

For the dashboard app:

- `bun run --cwd apps/dashboard dev`

For the standalone marketing web app:

- `bun install --cwd web`
- `bun run --cwd web build`

## Branching and commits

- Keep pull requests focused and small when possible.
- Use clear commit messages that explain intent.
- Link related issues in the PR description.

## Pull request checklist

- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Build passes
- [ ] Docs updated when behavior changed (`README.md`, `TESTING.md`, or package docs)

## Reporting issues

Please include:

- Expected behavior
- Actual behavior
- Repro steps
- Environment details (OS, Bun version, provider setup if relevant)
