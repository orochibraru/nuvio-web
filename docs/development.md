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

Installing dependencies runs `prek install`, which wires three shims:
`pre-commit` runs the fixers and checks, `commit-msg` enforces Conventional
Commits, and `pre-push` runs the type check and the unit suite. releaser
computes the next version from commit subjects, so a malformed one silently
costs a release rather than failing loudly.

If `prek` is not installed the `prepare` script skips hook installation rather
than failing the install — you just do not get the hooks.

## Scripts

```bash
bun run dev          # vite dev on :5173
bun run build        # production build
bun run start        # run the compiled binary
bun run check        # svelte-kit sync + svelte-check
bun run lint         # every prek pre-commit hook, on all files (fixes)
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

- A `#lib/…` TS module **ends `.js`**: the alias is not rewritten on emit, so a
  `.ts` there fails `bun run check`. A component keeps `.svelte`.
- A relative import **ends `.ts`**, naming the real file.

Reach for a relative import only inside the same directory. Anything crossing a
directory goes through `#lib/…`, so a future move is one find-and-replace. The
exception: a route may import a sibling or parent route's `.remote.ts`
relatively, since routes aren't under `#lib`.

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

[`orochibraru/releaser`](https://github.com/orochibraru/releaser), driven by
commit subjects. `fix`, `feat`, `perf`, `revert`, `refactor` and breaking
changes all bump the patch; other types, `docs` included, don't release (Publish
ignores docs-only pushes anyway, so a `docs:` commit ships with the next code
change). `main` is the canary channel:

- Every push to `main` builds the image (or re-tags the merged PR's already
  tested `pr-NNN` one), pushes it as `:canary`, and publishes an
  `X.Y.Z-canary.N` GitHub prerelease. With nothing releasable since the last
  release, `X.Y.Z` is that release's patch plus one, so the canary still sorts
  after it.
- The same run opens or updates a `chore(release): X.Y.Z` pull request carrying
  the version bump and the changelog.
- Merging that PR releases the last canary as is: its image is re-tagged
  `:vX.Y.Z` and `:latest`, nothing is rebuilt, and releaser tags the release
  commit and publishes the GitHub release.

releaser pushes the release branch and tags over a deploy key
(`RELEASE_DEPLOY_KEY` secret, write access). A push made with `github.token`
triggers no workflow, so the release PR would never get its required `CI Gate`
check. To rotate it: `ssh-keygen -t ed25519 -N "" -f release`, add `release.pub`
as a deploy key with write access, store `release` as the secret.
