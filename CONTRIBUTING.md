# Contributing

## Requirements

- Bun
- Docker
- [prek](https://github.com/j178/prek) : runs the pre-commit hooks
  (`brew install prek`, or see the repo for other installers)

## Setup

This repo uses SvelteKit with Typescript and Bun. For convenience installing
dependencies will setup the pre-commit hooks (via `prek install`) to run linters
and formatters before you commit. This helps reducing usage of CI minutes just
for formatting tasks and prevents commits such as "chore: fix lint".

The hooks live in `.pre-commit-config.yaml` and are the same set CI runs, so a
green commit locally is a green Code Quality job. They only look at what you
staged, except the whole-project ones (`svelte-check`, `tailwint`, the unit
suite) where the staged paths just decide whether it is worth running at all.

Two shims are installed, not one: `pre-commit` runs the fixers and checks, and
`commit-msg` enforces Conventional Commits : semantic-release computes the next
version from your commit subjects, so a malformed one silently costs a release
rather than failing loudly.

The last group is repo-specific: plain `grep` guards for the conventions in
`CLAUDE.md` that no linter knows about (`throw redirect(...)`, a `$lib` import,
a `#lib/...` specifier ending `.ts`, a raw `href="/..."` that skips `resolve`).
Each is at zero occurrences today : they guard against regression, they are not
a cleanup backlog.

Run them by hand over everything with:

```bash
prek run --all-files
```

If `prek` is not installed the `prepare` script skips hook installation rather
than failing the install : you just do not get the hooks.

## Dev

Run the dev server

```bash
bun run dev
```

Build the app

```bash
bun run build
```

Type check the app

```bash
bun run check
```

Run the linters

```bash
# Prettier, only for .md files
bun run prettier --log-level warn --write "**/*.md"

# Markdownlint, to ensure doc consistencys
bun run markdownlint-cli2 --fix "**/*.md"

# Tailwint, lints tailwindcss classes
bun run tailwint --fix . "**/*.svelte"

# Biome, formats and lints TS
bun run biome check --write --unsafe .ss
```

## OpenAPI spec

Nuvio publishes its public API as prose markdown, not as a machine-readable
document. Two scripts bridge the gap:

- `scripts/check-nuvio-spec.ts` fetches the live spec and compares it to the
  committed snapshot (`src/lib/nuvio/nuvio-public-api.snapshot.md`). It fails
  only when the **generated OpenAPI document** moves : a reworded or rewrapped
  page is reported and left green, because an "API drifted" issue over a
  reflowed paragraph is how a drift check stops being believed. The snapshot is
  a verbatim copy of an external document, so it is in `.prettierignore`;
  formatting it makes the check diff our own line wrapping forever.
- `scripts/build-nuvio-spec.ts` parses that snapshot into an OpenAPI 3.1
  document (`src/lib/nuvio/nuvio-public-api.json`). It is a real parser, not an
  LLM: request blocks become operations, the JSON examples give each payload its
  shape, and the field / parameter tables supply types, nullability, defaults,
  descriptions and which fields are required. The parser lives in
  `scripts/nuvio-spec/` and is unit-tested.

```bash
# Dry run, check if the live spec still matches the snapshot (CI runs this daily)
bun run nuvio:check

# Accept a new spec: updates the snapshot and regenerates the OpenAPI JSON
bun run nuvio:check:accept

# Regenerate the OpenAPI JSON from the committed snapshot
bun run nuvio:spec

# Fail if the committed JSON is stale (CI runs this on every PR)
bun run nuvio:spec:check
```

`src/lib/nuvio/types.ts` and `client.ts` are still written by hand; the
generated JSON is what you reconcile them against.

## Server admin page

`/admin` is a self-hosting surface, not a user feature. It lists who has signed
in to _this_ instance and can lock it to an allowlist.

- **Who gets in.** `NUVIO_ADMIN_EMAILS` (comma or whitespace separated),
  declared in `src/env.ts`. It is deliberately not stored in the database: who
  can administer the server is a deployment decision, not something a signed-in
  user can write. Non-admins get a 404, not a 403, so the page does not announce
  itself. Every route _and_ every remote function re-checks : the nav entry is
  cosmetic.
- **Server admins can always sign in**, listed on the allowlist or not, so a
  typo can never lock you out of the page that fixes it.
- **Locking** blocks sign-in and sign-up for anyone not allowlisted, and signs
  out existing sessions on their next request (a cookie otherwise outlives the
  decision by 30 days).
- **Storage** is SQLite (`bun:sqlite`) under `NUVIO_DATA_DIR` (default `data`,
  `/app/data` in the container : `compose.yaml` mounts it). One row per person,
  never one per sign-in. If the directory is unwritable the feature degrades to
  "no metrics, no lock" rather than 500-ing the app : the lock is stored _in_
  that database, so no database means nobody ever turned it on.

Environment variables go through SvelteKit 3's explicit environment variables
(`experimental.explicitEnvironmentVariables` in `vite.config.ts`): declare them
in `src/env.ts`, then import the name itself from `$app/env/private`. An
undeclared name is not readable at all. Leave them non-`static` so a container
reads them at boot instead of having a build-time value inlined.

## Tests

```bash
# Run unit tests
bun run test:unit

# Run integration tests
bun run test:integration

# E2E tests
bun run test:e2e
```

## Docker

Build the docker image

```bash
docker buildx build -t nuvio-web:latest .
```

Run the imagge

```bash
docker run --rm -p 3000:3000 nuvio-web:latest
```
