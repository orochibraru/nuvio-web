# Install

Nuvio Web is distributed as a multi-arch Docker image
([`orochibraru/nuvio-web`](https://hub.docker.com/r/orochibraru/nuvio-web)) for
`linux/amd64` and `linux/arm64`. There is no database to provision, but mount a
volume on `/app/data`: the app keeps signed-in sessions and each profile's
library, watch progress and history there, in SQLite, and syncs them with your
Nuvio account in the background ([Sync](sync.md)). Without it, a restart signs
everyone out and drops changes not yet pushed to Nuvio. One container per data
directory.

You will need a [Nuvio](https://nuvio.tv/) account. You can create one from the
app's own sign-up screen.

## Docker run

```bash
docker run -p 3000:3000 -e ORIGIN=http://localhost:3000 \
  -v ./data:/app/data \
  orochibraru/nuvio-web:latest
```

## Docker Compose

```yaml
services:
  nuvio:
    image: orochibraru/nuvio-web:latest
    restart: unless-stopped
    ports:
      - 3000:3000
    volumes:
      # Sessions, and your library / progress / history. Back it up.
      - ./data:/app/data
    environment:
      # The URL you actually browse to. See Configuration.
      ORIGIN: http://localhost:3000
    healthcheck:
      interval: 30s
      retries: 3
      start_period: 5s
      test: ["CMD", "/app/dist/healthcheck"]
      timeout: 30s
```

Then open <http://localhost:3000>.

## Tags

| Tag      | What it is                                             |
| -------- | ------------------------------------------------------ |
| `latest` | The most recent stable release                         |
| `vX.Y.Z` | A specific stable release                              |
| `canary` | The latest build of `main`, ahead of the next release  |
| `pr-NNN` | A pull request build, for trying a change before merge |

Pin a `vX.Y.Z` tag if you want an upgrade to be a decision rather than a
restart.

## What is in the image

The runtime layer is `debian:bookworm-slim` plus one binary. The build compiles
the SvelteKit app with the Bun runtime embedded into a self-contained
`/app/dist/server` via
[`svelte-smol`](https://github.com/orochibraru/svelte-smol), so the image ships
no Bun install and no `node_modules`. It runs as an unprivileged user (uid
10001).

`/app/dist/healthcheck` is a second self-contained binary suitable for Docker's
`HEALTHCHECK` and for orchestrator liveness and readiness probes; the image
declares it already.

## Building it yourself

```bash
docker buildx build -t nuvio-web:latest .
```

Or through the bake definition, which is what CI uses:

```bash
docker buildx bake app
```

## Without Docker

```bash
bun install
bun run build
bun run start   # serves ./build/server on :3000
```

Bun is the only prerequisite. See [Development](development) for the dev server.
