# Contributing

The long-form documentation lives in [`docs/`](docs/) and is published at
<https://orochibraru.com/nuvio-web>. This file is the short version: what you
need to get a change landed.

- [docs/development.md](docs/development.md) : setup, scripts, hooks,
  conventions
- [docs/testing.md](docs/testing.md) : the three test levels and when to run
  which
- [docs/architecture.md](docs/architecture.md) : how the app is put together
- [docs/nuvio-api.md](docs/nuvio-api.md) : the API spec snapshot and drift check
- [docs/admin.md](docs/admin.md) : the self-hosting admin surface

## Requirements

- [Bun](https://bun.sh)
- Docker, to build the image
- [prek](https://github.com/j178/prek) : runs the pre-commit hooks
  (`brew install prek`, or see the repo for other installers)

## Setup

```bash
bun install   # also installs the pre-commit hooks
bun run dev   # dev server on :5173
```

Installing dependencies sets up the pre-commit hooks (via `prek install`) so the
linters and formatters run before you commit. This reduces CI minutes spent on
formatting and prevents commits such as "chore: fix lint".

Three shims are installed: `pre-commit` runs the fast fixers and checks,
`commit-msg` enforces Conventional Commits (semantic-release computes the next
version from your commit subjects, so a malformed one silently costs a release
rather than failing loudly), and `pre-push` runs the slow whole-project ones
(`svelte-check`, the unit suite).

If `prek` is not installed the `prepare` script skips hook installation rather
than failing the install : you just do not get the hooks.

## The commands

```bash
bun run dev              # vite dev on :5173
bun run build            # production build
bun run start            # run the compiled binary from ./build
bun run check            # svelte-kit sync + svelte-check
bun run lint             # tailwint + biome
bun run lint:fix         # tailwint --fix + biome check --write
bun run format           # markdownlint + prettier, markdown only
bun run format:fix       # the same, writing
bun run test:unit        # vitest
bun run test:unit:coverage
bun run test:e2e         # playwright (needs a test account, see .env.example)
```

The package manager is **bun**. Never npx or npm.

## Pre-commit hooks

The hooks live in `.pre-commit-config.yaml` and are the same set CI runs, so a
green commit locally is a green Code Quality job. They only look at what you
staged, except the whole-project ones (`svelte-check`, `tailwint`, the unit
suite) where the staged paths just decide whether it is worth running at all.
The type check and unit suite wait for `git push`; run them sooner with
`prek run --hook-stage pre-push`.

The last group is repo-specific: plain `grep` guards for the conventions in
`CLAUDE.md` that no linter knows about (`throw redirect(...)`, a `$lib` import,
a `#lib/...` specifier ending `.ts`, a raw `href="/..."` that skips `resolve`).
Each is at zero occurrences today : they guard against regression, they are not
a cleanup backlog.

Run them by hand over everything with:

```bash
prek run --all-files
```

## Before you open a PR

- `bun run check` and `bun run lint` are necessary but not sufficient : they do
  not catch a bad reactive access, a hydration mismatch or a broken remote call.
- **After any UI or route change, run `bun run test:e2e`** and make it pass. Add
  a spec when you add a screen or a flow, and add new screens to
  `e2e/a11y.spec.ts`'s `pages` list.
- The e2e suite shares one auth token because the real `api.nuvio.tv`
  rate-limits : run the spec you touched rather than the whole suite.
- Conventional Commit subjects. The `commit-msg` hook will tell you.

## Docker

```bash
docker buildx build -t nuvio-web:latest .
docker run --rm -p 3000:3000 -e ORIGIN=http://localhost:3000 nuvio-web:latest
```

See [docs/install.md](docs/install.md) and
[docs/configuration.md](docs/configuration.md) for what `ORIGIN` does and why
you want it set.
