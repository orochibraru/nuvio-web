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

## OpenAPI types

This app has a script that checks the latest version of the Nuvio openapi doc to
ensure the types are up to date.

```bash
# Dry run, check if version is up to date (mostly for CI usage)
bun run nuvio:check

# If a new version is available, the types need to be updated manually (for now). Then this command can be ran to accept the changes.
bun run nuvio:check:accept
```

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
