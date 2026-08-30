# Nuvio web — build plan

The browser build of Nuvio: a full streaming client. Stremio-compatible addon
layer for content (catalog / meta / stream / subtitles) + an in-browser player,
with profiles, library, collections, watch progress and history synced through
the Nuvio public API (`$lib/nuvio`, client methods in
`src/lib/nuvio/client.ts`).

Target: **desktop web only** (mouse + keyboard, large screen). Mobile and TV are
covered by the existing Nuvio mobile app. This is net-new — there is no Nuvio
web today, and the desktop experience is what's lacking.

The mobile app is the reference for behaviour the API doesn't pin down: the
shapes of the settings / home-catalog / collections JSON blobs (server enforces
no schema), the progress-key format, and the 90% / 60s completion rule.

---

## Architecture

- **Two data sources.** (1) The Nuvio API — user data only: profiles, addon
  list, library, watch progress, history, settings, collections. (2) **Addons**
  — the Stremio addon protocol, fetched from each addon's manifest URL. All
  content (posters, metadata, episodes, streams, subtitles) comes from addons.
- **Local store (IndexedDB).** Mirror of synced library / progress / history +
  delta cursors, so screens render instantly and reconcile in the background.
  Also caches addon manifests and catalog/meta responses with a TTL.
- **Sync engine.** Bootstrap = capture cursor → page the snapshot → apply deltas
  since the cursor → persist the max `event_id`. Then delta pulls on an interval
  and on focus. Writes are optimistic: mutate local → enqueue → push.
  Progress/history use non-destructive merge; library uses incremental
  upsert/delete; addons/collections/profiles/settings are full-replace.
- **Current profile.** Every sync RPC needs `p_profile_id`. Tracked server-side
  in a cookie; `hooks.server.ts` puts `locals.profileId` alongside
  `locals.nuvio`. No profile selected → routes bounce to `/profiles`.
- **Routing.** `(protected)` = signed in; nested `(app)` group also requires a
  selected profile. `(watch)` group wraps `/detail` + `/player` and owns the
  shared source drawer. `/profiles` and `/account` sit outside `(app)`.
- **Content vs user data on the server.** `+page.server.ts` loads may `await`
  **user-data** remote functions (real SSR). **Addon-sourced content** loads
  client-side with a skeleton so a slow addon never stalls SSR or navigation.
  Every page guards `data.*` against undefined (a `forkPreloads` speculative
  render can instantiate a component before its `data` prop is populated).
- **IDs.** `content_id` e.g. `tmdb:550`; `content_type` `movie` | `series`.
  Episodes: `video_id` `tmdb:1396:1:1` + `season`/`episode`. Server computes
  `progress_key`.
- **Zero config.** No env vars. Ships pointed at the hosted Nuvio API
  (publishable key is public, in `client.ts`). One allowed override:
  `NUVIO_API_URL` for self-hosters, read once in `hooks.server.ts`.

Status legend: `[ ]` open · `[~]` partially done · shipped work is folded into
each area's collapsed **Shipped** list (implementation detail lives in the code,
not here).

---

## Home & discovery

- [ ] Make the UI sexier — colourful, playful, we should _want_ to use it
      (background blurs, colour accents, custom backgrounds).
- [ ] Home hero → real slide animation between spotlights (currently a
      crossfade).
- [ ] Home layout editor in Settings → needs `client.homeCatalog`.
- [ ] `command`-palette style nav search.

<details><summary>Shipped</summary>

- Home `/` — catalog rows (`homeRows`, client-side + skeleton), "My library" row
  (reads the local store live), continue-watching row with time-remaining.
- Auto-advancing featured hero carousel — up to 6 backdropped titles, dot
  indicators + prev/next arrows, pause on hover/focus, off under reduced-motion,
  fade between slides, skeleton hero (same box, no layout jump).
- "Add to library" on the hero spotlight.
- Discover `/discover?c=<addon|type|catalog>&g=<genre>` — catalog + genre pills,
  `MediaGrid` + "Load more" (`browseCatalog` client-side + skeleton).
- Search `/search?q=` — auto-searches on type (450ms debounce, `replaceState`),
  Enter searches immediately, results grouped Movies / Series / Other, remote
  query cached by args. No query / no results → discover catalog rows ("you
  might like").

</details>

## Title detail

Nothing open.

<details><summary>Shipped</summary>

- `/detail/[type]/[id]` — `getMeta` hero (backdrop / poster / logo / title /
  year / runtime / genres / IMDb rating), description, expanded facts (director
  / writer / country / released / awards), `meta.status` for series. Renders
  from a `stableMeta` mirror (fork-preload safe).
- Watched flag on the hero — "Watched" for a finished movie, "Watched" / "N/M
  watched" for a series.
- Cast row (`cast-row.svelte`) — photo, name · age, short bio per person,
  sourced from Wikipedia's REST summary API (fetched client-side, memoised;
  initials-avatar fallback when there's no clear person match). Card links to
  `/search?q=<name>`. `getMeta` also recovers cast/crew from `meta.links` when
  the flat fields are empty (Cinemeta's newer shape).
- Trailers row → `trailer-modal.svelte` (`youtube-nocookie` embed).
- "More like this" row — `similarTitles` (top-genre catalog browse minus self).
- Season carousel (`season-carousel.svelte`) — scrollable season pills + a
  snap-scrolling row of 16:9 episode cards (number, title, synopsis, per-episode
  IMDb rating, air date, runtime), hover arrows, resume bar / watched tick /
  mark-watched, hover warms that episode's streams.
- Right-click menus (`ContextMenu`): poster (add/remove library, mark
  watched/unwatched, view details) · episode card (mark watched, "mark up to
  here") · season pill ("mark season N", "mark through season N"). Each fires a
  sonner toast.
- Streams preloaded ~700ms after `getMeta` for the CTA target; episode hover
  warms per-episode. One id at a time (addon rate limits).

</details>

## Playback

- [ ] End-of-episode overlay: "episode over" + next-episode CTA; if the show is
      airing, show the next air time instead; if it's the last episode of a
      finished show, "the show's over" + similar-show suggestions.
- [ ] When an episode is marked watched on a running show with a known next
      episode, surface the next episode + air date in continue-watching.
- [ ] Skip intro / skip outro — no addon supplies intro/outro timestamps
      (Stremio has no chapter data; AniSkip is anime-only). Needs a data source.
- [ ] Playback error handling — catch unplayable / no-audio content, offer
      "switch stream" + "open in external player" CTAs inline (external-player
      handoff already exists on the no-playable-stream state).

<details><summary>Shipped</summary>

- Flow: `/detail` → "Watch" / episode opens the right-hand source drawer
  (`sources-panel.svelte.ts` module state, owned by `(watch)` layout, shared
  with `/player`, no URL param) → pick → `/player/[type]/[id]`. "Sources"
  reopens the drawer in place.
- Source drawer (`stream-panel.svelte`) — async list + skeleton + Refresh, addon
  - quality filter chips, per-row attribution / quality / size.
- `/player/[type]/[id]` — `playbackContext` loads client-side (shell paints
  instantly on nav; `contextFallback` keeps `context.*` safe); reads the stream
  handoff or cold-resolves + auto-picks the first playable; floating Back button
  whenever no stream is loaded; always seeks to the saved resume position (no
  "you left off at" prompt); "open in VLC" + "copy link" for non-web-playable
  sources.
- `VideoPlayer` redesign — big centre transport cluster (±10s skip flanking
  play/pause, replay when ended), thick hover-scrub scrubber with time preview +
  buffered range, always-visible volume, size-9 hit targets, rate / PiP /
  fullscreen / captions cluster, auto-hide, keyboard (space/k, ←→/jl, ↑↓, f, m,
  c, n=next, e=episodes).
- Subtitle overlay — "Off" + every source with language name, addon, SDH badge;
  `getSubtitles` returns `{id, lang, url, addonName, sdh}`; appearance controls
  (size / colour / plate) persist; subtitle timing nudge (±0.5s).
- Audio-track selection — HLS only (hls.js), in the settings menu.
- Content-warning card on stream load — cert + genre descriptors, soft fade.
- Next-episode autoplay + "up next" card (10s countdown, gated on
  `autoPlayNext`).
- In-player episode drawer + season switcher (`player-episodes-panel.svelte`);
  next-episode button.
- Progress → `sync.saveProgress` every 15s + on unmount. Mark-watched via
  `sync.markWatched` (synthetic 100% row) / `sync.clearProgress`.
- Subtitles served via `/api/subtitle` (SRT→WebVTT, auth-gated).

</details>

## Library, collections & history

- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT` mode, "All" tab.
- [ ] `continueWatching` from the local progress store (needs poster/title —
      enrich from the library mirror or a cached meta lookup).
- [ ] Continue-watching is unreliable: items randomly removed, new ones not
      added.
- [ ] Stats page — minutes watched (movies vs shows), counts (shows / episodes /
      movies), preferred format, preferred categories.

<details><summary>Shipped</summary>

- `/library` — grid from the local store (falls back to the SSR payload while
  the store is authoritative-but-empty), filter (all / movie / series / watched
  / unwatched) + sort (recently added / A–Z / top rated) in `?filter`/`?sort`,
  hover-remove.
- `/history` — poster grid grouped Today / Yesterday / weekday / date, per-title
  poster + name (SSR-enriched via `getMeta` for unique recent ids), episode
  badge, "Rewatch" CTA, per-row delete.
- `/collections` — pin-sorted list, create / rename / pin / delete.
- `/collections/[id]` — folder contents resolve client-side + skeleton;
  `TABBED_GRID` / `ROWS` toggle; add folder (catalog multi-pick); delete folder.
- Poster cards show a watched check + in-library bookmark once the store is
  authoritative.

</details>

## Sync & data

- [ ] Trakt: OAuth (device or redirect) → token in an httpOnly cookie / settings
      blob → `$lib/trakt/` client for `sync/history`, `sync/watched`,
      `sync/collection`, `scrobble`. Map to the local store's shapes.
- [ ] SIMKL: same shape, SIMKL API.
- [ ] `$lib/sync/store.svelte.ts` reads/writes through whichever backend each
      domain (`librarySource` / `progressSource`) is set to; Nuvio stays the
      fallback + cross-device mirror.
- [ ] Store theme preferences locally + reconcile in the background — an AMOLED
      theme currently only applies after settings load (flicker).
- [ ] Right-click add/remove should invalidate any list still on a server
      snapshot (home library row now reads the store; audit the rest).

<details><summary>Shipped</summary>

- IndexedDB wrapper + bootstrap (cursor-before-snapshot, `bootstrapped` flag),
  delta pulls (90s interval + `visibilitychange` + 4s after attach), optimistic
  write queue (collapse repeats → 1.5s-debounced flush → 500-item batches,
  survives reload), reconcile (`reconcileDeltas` LWW + pending-write overlay).
- `$state` views (`sync.library/progress/history`, `libraryProgress`,
  `titleProgress()`, `isInLibrary()`), wired into library / history / detail /
  player.
- Unit tests: `reconcile.test.ts` (17 cases), `runtime.test.ts`.
- Settings scaffold for alternative sync backends — "Sync" card, `SYNC_SOURCES`
  in `uiSettingsSchema`, Trakt/SIMKL disabled until built.

</details>

## Settings & appearance

- [ ] Player defaults: stream quality (subtitle language / appearance done).
- [ ] Home layout editor → needs `client.homeCatalog`.

<details><summary>Shipped</summary>

- `/settings` Appearance — mode (system/light/dark), dark style (dim / AMOLED),
  7 accent presets; quick mode toggle in the profile dropdown; per-profile,
  cloud-stored, `ready`-gated so SSR uses server data.
- Playback section — autoplay-next toggle, preferred subtitle language, subtitle
  size / colour / background.
- Sync section (scaffold). Addons shortcut card.
- `title` store (`pageTitle`) — `Nuvio · <segment>`, into `<svelte:head>` +
  mirrored to `document.title`, per-page segments, client-only.

</details>

## Profiles & account

- [ ] Profile "manage" mode: rename, recolour, custom `avatar_url`, delete
      (`saveProfiles` + `deleteProfileData`). Show PIN-locked profiles as locked
      (read-only; no PIN flow in the public API).
- [ ] `uses_primary_addons` toggle for non-primary profiles.

<details><summary>Shipped</summary>

- `/profiles` picker — avatar grid + add-profile dialog; `selectProfile` /
  `createProfile`.
- App shell — top nav + profile dropdown (switch / settings / account / sign
  out).
- `/account` — email + member-since, change-password link-out, sign out,
  per-profile sync-counts table, danger-zone "clear this profile's data".
- Supporters — footer link goes straight to `nuvio.tv/support` (the in-app wall
  page was removed).

</details>

## Addons

- [ ] Addon catalog discovery (`addon_catalog` resource) — browse an addon's
      advertised catalogs before adding.
- [ ] Drag reorder (currently up/down buttons).

<details><summary>Shipped</summary>

- Manifest client (`parseAddonUrl`, `fetchManifest` 30-min cache, validate),
  registry (`buildRegistry`, per-addon isolation, `providersFor`), resource
  clients (`getCatalog` / `getMeta` / `getStreams` / `getSubtitles`, fan-out +
  per-addon error isolation, 15s timeout, 5-min response cache).
- `/addons` UI — installed list (logo, resource badges, catalog count,
  unreachable flag), add-by-URL + manifest preview, enable/disable, up/down
  reorder, remove → `saveAddons` full-replace.

</details>

## Polish & hardening

- [ ] Make the app mobile-friendly (currently a small-screen gate overlay); keep
      a dismissable bottom banner pointing at the mobile app instead. Use the
      branding logos in `lib/assets` / `static`.
- [ ] Health indicator (`client.healthCheck()` / `healthPing()`) → status page
      or degraded-mode banner.
- [ ] Image handling — lazy-load, decode async; provider poster URLs only.
- [ ] Perf — route-level code splitting, virtualised grids, prefetch on hover.
- [ ] Accessibility pass — focus management, ARIA on rows/tiles/player (partial;
      reduced-motion honoured).
- [ ] Offline states + retry affordances (empty-state component done;
      `+error.svelte` restyled; offline still open).
- [ ] Rate-limit safety — keep per-user request rate well under 100 req/s.
- [ ] Add Vitest for the addon registry.

<details><summary>Shipped</summary>

- Auth pages branded — wordmark + tagline, radial glows, scoped-dark.
- Fallback images — poster glyph + gradient, episode-thumbnail and
  continue-watching-card fallbacks with `onerror`.
- No content-await blocks SSR (home / discover / collections / player moved to
  client queries + skeletons). `data.*` guarded everywhere.
- Playwright smoke suite (`e2e/`, reuses the running dev server on :5173, shared
  auth token, zero-console-errors asserted on every page); Vitest for pure
  logic. Run `bun run test:e2e` after any UI change.
- Dedicated showcase-screenshot sequence (`e2e/showcase.spec.ts`,
  `bun run screenshots`) — a numbered walkthrough (sign-in → home → discover →
  detail → sources drawer → library → collections → history → settings → addons
  → account → player) for README/release screenshots. Its own Playwright
  project, excluded from `bun run test:e2e`.
- Small-screen gate overlay.

</details>

---

## CI/CD

- [ ] Strict TS / lint / check / format pipeline (biome + tailwint + markdown);
      unit + integration + e2e jobs.
- [ ] Periodic Nuvio-API contract-check job; alert on drift.
- [ ] Release mechanism (release-please) — screenshot the app for the README,
      publish the Docker image.

## Legal / compliance

The theory: Nuvio web is a shell. Addons (Stremio protocol, user-installed) do
all content provisioning. The app hosts nothing. Items below are where the code
diverges from that or fails to state it.

- [ ] **Disclaimer + minimal ToS** — no content hosted; addons are third-party;
      the user chooses them and is responsible. Surface in-app (first run + top
      of `/addons`) + README.
- [ ] **`LICENSE` file** — none today. Public repo + published image with no
      license = nobody has rights and there's no warranty disclaimer.
- [ ] **Move addon resource fetching client-side.** `getStreams` /
      `resolveStreams` / `getCatalog` / `getMeta` run in remote functions (on
      the host's server, done for CORS). That makes the operator's server query
      scraper/torrent addons and relay infringing URLs. Move stream resolution
      to the browser; where CORS forces server involvement, keep it a dumb
      non-caching pass-through. Stop caching catalog/meta server-side.
- [ ] **Subtitle proxy (`/api/subtitle`)** — server fetches + converts +
      re-serves subtitle files under our origin with a 1-day cache. Do the
      SRT→WebVTT conversion in the browser; if a proxy is unavoidable, drop the
      cache.
- [ ] **Never bundle default addons** pointing at infringing sources. Keep
      `/addons` suggestions to metadata-only providers (Cinemeta, TMDB).
- [ ] **Keep playback client-side** — `video.src` / `hls.loadSource` in the
      browser, media never transits our server. No server-side stream proxy.
- [~] **Nuvio affiliation** — app ships a hardcoded `api.nuvio.tv` key, auths
  real users against the Nuvio backend, uses the Nuvio name + logo. README says
  "unofficial". Plan: ask the Nuvio team to review; if they decline, get written
  permission or self-host the backend and drop the marks.

## Open decisions

- **Playable containers.** Scope = direct http(s) mp4 + HLS. External-player
  handoff (`vlc://` / copy URL) for the rest → **done** on the no-playable
  state; still want it inline as a fallback CTA when a stream fails mid-play.
- **Poster proxy.** Provider URLs only (no server-side handling of copyrightable
  content).
- **Addon CORS.** No server-side addon proxy (addons return copyrightable links;
  keep it browser-only).
- **Offline.** Meta only — read-only browsing + the existing write queue.
- **Legacy library push.** Stay on incremental `upsertItems`/`deleteItems`;
  never `replaceLegacy`.
- **Trailer playback.** YouTube embed (chosen).
- **Multi-tab.** BroadcastChannel to keep the local store / player state
  coherent across tabs?
