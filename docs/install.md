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
docker run -p 3000:3000 \
  -v ./data:/app/data \
  orochibraru/nuvio-web:latest
```

Serve it over HTTPS, behind a reverse proxy: on plain HTTP the app renders but
nothing saves. See [Configuration](configuration).

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
      # Behind a reverse proxy that terminates HTTPS. See Configuration.
      PROTOCOL_HEADER: x-forwarded-proto
      HOST_HEADER: x-forwarded-host
    healthcheck:
      interval: 30s
      retries: 3
      start_period: 5s
      test: ["CMD", "curl", "-fsS", "http://localhost:3000/api/health"]
      timeout: 30s
```

Then open it at the HTTPS address your proxy serves.

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

The runtime layer is `debian:bookworm-slim`, `curl` for the health check, and
one binary. The build compiles the SvelteKit app with the Bun runtime embedded
into a self-contained `/app/dist/server` via
[`@sveltejs/adapter-bun`](https://svelte.dev/docs/kit/adapter-bun), so the image
ships no Bun install and no `node_modules`. It runs as an unprivileged user (uid
10001).

`GET /api/health` answers 200 while the server is up. The image's `HEALTHCHECK`
curls it; orchestrators can probe it directly.

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
