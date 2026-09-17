# Development

## Requirements

- [Bun](https://bun.sh)
- Docker, for building the image
- [prek](https://github.com/j178/prek) — runs the pre-commit hooks
  (`brew install prek`)

## Setup

```bash
bun install          # also installs the pre-commit hooks
bun run dev          # dev server on :5173
```

Installing dependencies runs `prek install`, which wires two shims: `pre-commit`
runs the fixers and checks, and `commit-msg` enforces Conventional Commits.
semantic-release computes the next version from commit subjects, so a malformed
one silently costs a release rather than failing loudly.

If `prek` is not installed the `prepare` script skips hook installation rather
than failing the install — you just do not get the hooks.

## Scripts

```bash
bun run dev          # vite dev on :5173
bun run build        # production build
bun run start        # run the compiled binary
bun run check        # svelte-kit sync + svelte-check
bun run lint         # tailwint + biome
bun run lint:fix     # tailwint --fix + biome check --write
bun run format       # markdownlint + prettier, markdown only
bun run format:fix   # the same, writing
bun run test:unit    # vitest
bun run test:e2e     # playwright, chromium project
```

The package manager is **bun**. Never npx or npm.

## Pre-commit hooks

The hooks in `.pre-commit-config.yaml` are the same set CI runs, so a green
commit locally is a green Code Quality job. They look only at what you staged,
except the whole-project ones (`svelte-check`, `tailwint`, the unit suite) where
the staged paths just decide whether it is worth running at all.

Run them over everything with:

```bash
prek run --all-files
```

The last group is repo-specific: plain `grep` guards for the conventions no
linter knows about — `throw redirect(...)`, a `$lib` import, a `#lib/...`
specifier ending `.ts`, a raw `href="/..."` that skips `resolve`. Each is at
zero occurrences today; they guard against regression, they are not a cleanup
backlog.

## Conventions

These are enforced, by a linter or by a hook. The full set is in `CLAUDE.md`.

**Always brace control statements.** `if (x) { return; }`, never
`if (x) return;`. Biome flags it, but its fix is "unsafe", so `lint:fix` will
not add the braces for you.

**`#lib` subpath imports.** SvelteKit 3 dropped the `$lib` alias. Which
extension you write depends on the form:

- `#lib/…` **always ends `.js`** — the alias is not rewritten on emit, so a
  `.ts` there fails `bun run check`.
- A relative import **ends `.ts`**, naming the real file.

Reach for a relative import only inside the same directory. Anything crossing a
directory goes through `#lib/…`, so a future move is one find-and-replace.

**Every internal link goes through `resolve`** from `$app/paths` — `href`,
`goto`, `redirect`, `depends`. SvelteKit 3 type-checks it against the route
table, so a renamed or deleted route fails `bun run check` instead of 404ing in
production. Prefer the pathname form without a leading slash:

```ts
resolve("discover");
resolve(`detail/${type}/${id}`);
```

The site root is `resolve("/(protected)/(app)")` — there is no bare `/` route.
Only external URLs skip `resolve`.

**`redirect()` and `error()` throw on their own.** Call them bare:
`redirect(303, resolve("profiles"))`, never `throw redirect(...)`.

**A `.remote.ts` file may export only remote functions.** Schemas, types,
constants and server data-helpers go in a sibling `*.ts`.

**Anything crossing structured clone gets `$state.snapshot()` first.** See
[The sync store](sync-store).

## Environment variables

Declare the name in `src/env.ts` with a description and a schema, then import it
from `$app/env/private`. An undeclared name is not readable at all. Leave them
non-`static`, so a container reads them at boot instead of having a build-time
value inlined.

## Releases

semantic-release, driven by commit subjects. A `fix:` bumps the patch, a `feat:`
the minor, a `!` or `BREAKING CHANGE:` the major. The changelog, the tag, the
GitHub release and the Docker Hub tags all follow from that, which is why the
`commit-msg` hook exists.
