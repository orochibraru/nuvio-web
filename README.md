# Nuvio Web

Unofficial implementation of the [Nuvio](https://nuvio.tv/) API in a web UI
(since there is none, yet).

Sign in with the Nuvio account you already use on mobile and you get the same
profiles, addons, library and watch progress in a browser : plus a player that
streams in the tab, casts to a TV, or hands the link off to a native app.

[![Docker Hub](https://img.shields.io/docker/v/orochibraru/nuvio-web?label=docker%20hub&sort=semver)](https://hub.docker.com/r/orochibraru/nuvio-web)
[![Image size](https://img.shields.io/docker/image-size/orochibraru/nuvio-web/latest)](https://hub.docker.com/r/orochibraru/nuvio-web)
[![License](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue)](LICENSE)

<!-- Regenerate with `bun run screenshots`; do not edit by hand. -->
<!-- markdownlint-disable MD033 -->

<a href="./docs/showcase.md">
  <img alt="Nuvio Web: your Nuvio, in a browser" src="docs/images/feature-web.webp">
</a>

<!-- markdownlint-enable MD033 -->

[See every screen, light and dark](./docs/showcase.md)

## Disclaimer

Nuvio Web hosts no media. All catalogs, metadata, streams and subtitles come
from **addons** (the Stremio addon protocol) which **you install and are
responsible for**. The app is a shell around whatever those addons return; it
does not endorse, index, or verify any addon or its content. Use only addons you
have the right to use in your jurisdiction. Not affiliated with or endorsed by
Nuvio.

## Features

### Browse

- **Home** : a rotating hero spotlight, continue watching, your library, and a
  row per catalog your addons expose.
- **Discover** : the full catalog browser: any catalog from any installed addon,
  filtered by genre, paginated.
- **Search** : fans out across every addon that serves a search catalog, and
  remembers your recent queries.
- **Detail pages** : synopsis, cast, IMDb rating, trailer, season and episode
  carousel, and a _where to watch_ row (JustWatch) listing the official
  streaming, rent and buy options for your region.
- **Command palette** : `⌘K` / `Ctrl-K` from anywhere to jump to a screen or
  start a search.

### Watch

- **Source picker** with quality, codec, size and release details parsed out of
  each addon's stream label, and an auto-pick that honours your preferred
  resolution.
- **HLS and direct playback** : `hls.js` for `.m3u8`, the element's own `src`
  for everything else, with audio-track switching on either.
- **Subtitles** from addons : SRT converted to WebVTT in the browser, so a
  subtitle file never touches the server : with size, colour, background plate
  and an auto-selected preferred language.
- **Skip intro / outro** via [TheIntroDB](https://theintrodb.org). The keyless
  public tier works out of the box; add your own API key in Settings to raise
  the limits.
- **Auto-play next episode**, with an end-of-episode panel.
- **Cast to a TV** with no third-party SDK: the standard Remote Playback API
  (Chromecast on Chrome/Edge), falling back to WebKit's AirPlay hooks in Safari.
- **Play in an external player** : an Intent chooser on Android, VLC's
  x-callback on iOS, the raw `magnet:` for a P2P source, and copy-to-clipboard
  on desktop.
- **Playback diagnostics** : the codec is probed before the stream is handed to
  `<video>`, and playback that decodes no frames (unsupported HEVC/AV1) or no
  audio (Dolby Digital / DTS / Atmos) raises a dismissible banner instead of a
  black screen with no explanation.
- **Keyboard shortcuts** : see below.

### Library and sync

- Library, continue watching and history, kept per profile.
- **Collections** : your own folders of titles, separate from the library.
- **Local-first sync store** : an IndexedDB mirror with an optimistic write
  queue and a background delta pull, so a bookmark or a progress save lands
  instantly and reconciles later. Open tabs stay in step over
  `BroadcastChannel`.
- **Watch stats** and a full, editable history under Account.

### Make it yours

- **Profiles**, with avatars, as on mobile.
- **Themes** : light / dark / system, a dim or AMOLED dark style, and seven
  accent colours.
- **Settings** for appearance, playback, sync, addons and integrations, stored
  on your Nuvio account so they follow you between devices.
- **Accessible by default** : every route is checked against WCAG 2 A/AA in CI
  (axe), including skip links and focus management.

## Documentation

Full docs live in [`docs/`](docs/) and are published at
<https://orochibraru.com/nuvio-web> : install and configuration, every screen,
the self-hosting admin surface, the architecture, and how to work on it.

## Getting started

You need a [Nuvio](https://nuvio.tv/) account (you can create one from the app's
sign-up screen) and at least one addon. Addons installed on your account —
mobile or web : show up everywhere.

The docker image is available
[at Docker Hub](https://hub.docker.com/r/orochibraru/nuvio-web), for
`linux/amd64` and `linux/arm64`.

### Docker run

```bash
docker run -p 3000:3000 \
  -v ./data:/app/data \
  orochibraru/nuvio-web:latest
```

### Docker Compose

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
      # Behind a reverse proxy that terminates HTTPS : see Configuration below.
      PROTOCOL_HEADER: x-forwarded-proto
      HOST_HEADER: x-forwarded-host
    healthcheck:
      interval: 30s
      retries: 3
      start_period: 5s
      test: ["CMD", "curl", "-fsS", "http://localhost:3000/api/health"]
      timeout: 30s
```

Put it behind a reverse proxy that serves HTTPS, open that address, sign in,
pick a profile, and add an addon from **Settings → Addons** if your account has
none yet.

### Configuration

Mount a volume on `/app/data`. It holds a small SQLite database: signed-in
sessions (Nuvio tokens, encrypted) and each profile's library, watch progress
and history. That database is the source of truth; it syncs both ways with your
Nuvio account in the background, so the Nuvio apps stay in step (see
[Sync](docs/sync.md)). Without the volume, a restart signs everyone out and
drops any change not yet pushed to Nuvio. Run one container per data directory.
Account, profiles, addons and settings still live on your Nuvio account. The
container serves the app on port `3000`; `GET /api/health` answers 200 while it
is up, for `HEALTHCHECK` and orchestrator probes.

**Serve it over HTTPS.** SvelteKit rejects any write whose `Origin` header
doesn't match the app's own origin, and the image assumes `https://` with the
host from the `Host` header. Behind a reverse proxy, name the headers that carry
the public scheme and host:

| Variable          | Default           | When you need it                      |
| ----------------- | ----------------- | ------------------------------------- |
| `PROTOCOL_HEADER` | assumes `https`   | Behind a reverse proxy                |
| `HOST_HEADER`     | the `Host` header | Behind a proxy that rewrites the host |
| `PORT`            | `3000`            | To listen on another port             |

On plain HTTP (`http://localhost:3000`, a LAN address) the app renders, but
nothing saves: every write gets `403 Cross-site remote requests are forbidden`.
SvelteKit 3 only takes a fixed origin at build time, so plain HTTP needs your
own image built with `--build-arg NUVIO_BUILD_ORIGIN=http://…`. The `ORIGIN`
variable from earlier releases does nothing now. Details in
[Configuration](docs/configuration.md).

Running it on the public internet is on you: put it behind HTTPS and whatever
access control you would give any other self-hosted app.

## Keyboard shortcuts

In the player:

| Key                     | Action                  |
| ----------------------- | ----------------------- |
| `Space` / `K`           | Play / pause            |
| `←` / `J` and `→` / `L` | Seek 10s back / forward |
| `↑` / `↓`               | Volume                  |
| `M`                     | Mute                    |
| `F`                     | Fullscreen              |
| `C`                     | Cycle subtitle track    |
| `I`                     | Info overlay            |
| `N`                     | Next episode            |
| `E`                     | Episode list            |
| `Esc`                   | Close the open panel    |

Anywhere in the app, `⌘K` / `Ctrl-K` opens the command palette.

## How it works

- **SvelteKit 3 / Svelte 5** (runes, `experimental.async`), Tailwind 4 and
  shadcn-svelte components.
- **Streamed loads.** `+page.server.ts` returns promises rather than awaiting
  them, so navigation completes on the page shell and each row fills in behind
  its own skeleton. Everything a page needs for its URL is fetched by the load —
  addon fan-out included : instead of costing an extra round trip after
  hydration.
- **Addon fan-out on the server**, pooled rather than `Promise.all`-ed (bounded
  concurrency, a per-request timeout, and a failed addon degrading to an empty
  row) so one slow addon can't hold a page hostage. Outbound addon fetches go
  through an SSRF guard that refuses private and link-local address ranges.
- **Remote functions** are reserved for client-initiated work : a button, a
  right-click action, "load more".
- **One binary in the image.** The built app, Bun runtime embedded, is compiled
  by [`@sveltejs/adapter-bun`](https://svelte.dev/docs/kit/adapter-bun) into a
  self-contained server binary, so the runtime layer is `debian:slim` plus that
  binary : no Bun, no `node_modules`.
- **Tested at three levels** : Vitest for the framework-agnostic logic
  (reconcile, stream parsing, codec probes, external-player URLs), Playwright
  for the flows, and axe for accessibility. Specs assert a clean console: an
  uncaught exception fails the run.

## Development

See [contributing.md](CONTRIBUTING.md).

```bash
bun install
bun run dev          # dev server on :5173
bun run check        # svelte-check + tsc
bun run lint         # biome + tailwind class lint
bun run test:unit    # vitest
bun run test:e2e     # playwright (needs a test account, see .env.example)
```

## Roadmap

Tracked in [TODO.md](TODO.md)

## License

[AGPL-3.0-or-later](LICENSE). If you run a modified version as a network
service, you must offer its source to your users.
