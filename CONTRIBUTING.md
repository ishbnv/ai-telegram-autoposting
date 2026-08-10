# Contributing

Thanks for taking the time. Bug reports, ideas and pull requests are all welcome.

## Getting set up

Requirements: Node 22+, pnpm, Docker.

```bash
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d postgres
pnpm db:migrate
pnpm dev
```

You do not need a real Telegram bot or OpenRouter key to work on the admin panel, but you do need
both to exercise the generation and publishing paths end to end.

## Before opening a pull request

```bash
pnpm check
```

That runs typecheck, lint, tests and a Prettier check across the monorepo — the same thing CI runs.
Prettier owns formatting, so fix style with `pnpm format` rather than by hand.

## Ground rules

A few things are load-bearing rather than stylistic. A pull request that changes them will be asked
to change back:

- **No auto-publish.** A post reaches a Telegram channel only after a human presses the approval
  button. Please do not add a code path that skips it.
- **Secrets come from the environment.** Never put tokens, keys or chat IDs into the schema, seeds,
  fixtures, tests or logs. This repository is public.
- **Status changes are conditional updates.** `WHERE status = '...'` guards exist so that a
  double-tapped button is a no-op instead of a duplicate post. Keep them.
- **Source content is untrusted.** It is fed to an LLM, so it stays inside delimiters with the
  guard instruction in place.
- **UI components come from shadcn.** Add them with
  `pnpm dlx shadcn@latest add <name> -c apps/web`; do not hand-write or fork them.
- **Validate at the boundary.** HTTP bodies, environment variables and third-party responses go
  through zod before they reach domain code.

Architecture background lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Commits and branches

Branches are named `feat/ATP-<n>-<slug>` or `fix/<slug>`. Commit messages are free-form but should
say what changed and why; keep unrelated changes in separate commits.

## Scope

The project deliberately stays small: one Telegram bot, one Postgres database, no message broker.
If a change adds a new runtime service or a new external dependency, please open an issue first so
we can talk about whether it earns its keep.
