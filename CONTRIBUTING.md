# Contributing

## Requirements

- Bun
- Docker

## Setup

This repo uses SvelteKit with Typescript and Bun. For convenience installing
dependencies will setup Husky (pre-commit hooks) to run linters and format
before you push. This helps reducing usage of CI minutes just for formatting
tasks and prevents commits such as "chore: fix lint".

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
