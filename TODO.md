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
- **Zero config.** No required env vars. Ships pointed at the hosted Nuvio API
  (publishable key is public, in `client.ts`). Optional: `NUVIO_API_URL` for
  self-hosters (read once in `hooks.server.ts`); `INTRODB_API_KEY` to lift
  TheIntroDB rate limits for skip-intro (the endpoint works keyless too).

Status legend: `[ ]` open · `[~]` partially done · `[x]` done (kept inline only
where an area has no **Shipped** list) · larger shipped work is folded into each
area's collapsed **Shipped** list (implementation detail lives in the code, not
here).

---

## Home & discovery

- [ ] Make the UI sexier — colourful, playful, we should _want_ to use it
      (background blurs, colour accents, custom backgrounds).
- [ ] Home layout editor in Settings → needs `client.homeCatalog`.
- [ ] Continue-watching card interactions — click the card → `/detail`, click
      the play button → `/player`; right-click context menu (Details / Play /
      Clear progress i.e. remove from the row).

<details><summary>Shipped</summary>

- Home `/` — catalog rows (`homeRows`, client-side + skeleton), "My library" row
  (reads the local store live), continue-watching row with time-remaining.
- Auto-advancing featured hero carousel — up to 6 backdropped titles, dot
  indicators + prev/next arrows, pause on hover/focus, off under reduced-motion,
  direction-aware slide (`fly`, forward/back tracked so a "prev" tap slides the
  other way) between slides, skeleton hero (same box, no layout jump).
- "Add to library" on the hero spotlight.
- Discover `/discover?c=<addon|type|catalog>&g=<genre>` — catalog + genre pills,
  `MediaGrid` + "Load more" (`browseCatalog` client-side + skeleton).
- Command palette (`command-palette.svelte`, ⌘K / Ctrl+K, bits-ui `Command` in a
  `Dialog`) — fuzzy-jump to any shell route, or "Search titles for …" to hand
  the query to `/search`. ⌘K hint in the header search affordance.
- Search `/search?q=` — auto-searches on type (450ms debounce, `replaceState`),
  Enter searches immediately, results grouped Movies / Series / Other, remote
  query cached by args. No query / no results → discover catalog rows ("you
  might like"). Recent-searches chips (`search-history.svelte.ts`, localStorage
  only, deduped + capped, per-chip remove + clear).

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

- [~] When an episode of a running show is finished, `continueWatching` rolls
  forward to the next episode (`nextEpisode` in `episodes.ts`, unit-tested) —
  shows as "Not started". The next-air-date for an unaired next episode is still
  open (needs a schedule source).
- [~] Skip intro / skip outro — done for shows/movies via TheIntroDB
  (`segments.remote.ts` / `segments.ts`, optional `INTRODB_API_KEY`, tmdb: /
  imdb id mapping, unit-tested; `mediaSegments` remote). "Skip intro" button in
  the intro window; crossing into the credits fires the outro handoff: an "Up
  next" card when there's a next episode, or the end-of-show shrink (player
  minimises to a corner PiP) + "more like this" grid. AniSkip for anime + a
  still-airing-show next-air-time are still open.

<details><summary>Shipped</summary>

- Playback error handling — `SRC_NOT_SUPPORTED` (bad container/codec) goes
  straight to the fatal overlay ("Choose another source" + "Back"); a
  network/decode error (debrid + torrent links stall and hiccup) gets one silent
  reload-from-position before the overlay. HLS fatals still route here. The
  no-playable-stream state offers the external-player handoff.
- No-audio handling —
  - **label**: streams naming a codec the browser can't decode (Dolby Digital /
    DTS / Atmos, no AAC fallback) are flagged "may be silent", sunk to the
    bottom of the source drawer (stable sort), and de-prioritised by
    `pickPreferredStream` (`audioSupport`).
  - **runtime** (`silent-audio.ts`, unit-tested): a rolling window of Chrome's
    `webkit{Video,Audio}DecodedByteCount` is classified by _delta_ — audio that
    decodes then stalls → "codec"; audio that never produced a byte → "no
    track"; brief buffer gaps and stalls are ignored. Firefox's `mozHasAudio`
    gives a definitive "no track"; `audioTracks` a positive confirmation.
    Label-flagged streams lower the confirmation threshold. On HLS it first
    tries switching to a stereo/AAC alt track. The banner distinguishes "no
    audio" from "codec not supported"; both dismissible, both offer other
    sources.
- Flow: `/detail` → "Watch" / episode CTA jumps straight to
  `/player/[type]/[id]` (the player cold-resolves + auto-picks the first
  playable, browser-friendly stream). A secondary "Select stream" button opens
  the right-hand source drawer (`sources-panel.svelte.ts` module state, owned by
  `(watch)` layout, shared with `/player`, no URL param) → pick →
  `/player/[type]/[id]`. "Sources" reopens the drawer in place.
- Source drawer (`stream-panel.svelte`) — async list + skeleton + Refresh,
  frosted-glass backdrop (`bg-background/80 backdrop-blur-xl`). Rich per-row
  meta parsed from the addon label + `behaviorHints` (`streamMeta`,
  unit-tested): release name, quality, source (REMUX / BluRay / WEB-DL…),
  video + audio codec, HDR / DV, 10-bit, size, seeders (P2P), language flags,
  "may be silent" badge. Left-hand filter panel (`filtersOpen`): Direct / P2P
  (default Direct only, counts per kind), quality chips, addon chips, and a show
  / hide toggle for likely-silent sources (hidden by default). Filters reset on
  video change.
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
- Outro handoff (fires on the TheIntroDB credits timestamp, or the real `ended`
  event as fallback): an "Up next" card (10s countdown when `autoPlayNext`,
  otherwise a plain Play button) when there's a next episode; a Netflix-style
  end-of-show takeover otherwise — the player shrinks to a corner PiP and a
  full-screen "You finished … / More like this" grid (`similarTitles`) with
  Watch again + Back to details slides in.
- In-player episode drawer + season switcher (`player-episodes-panel.svelte`);
  next-episode button.
- Progress → `sync.saveProgress` every 15s, on pause, on `visibilitychange` /
  `pagehide`, and on unmount (a `furthestPosition` guard stops a transient
  `currentTime` reset from pushing `position: 0` over real progress).
  Mark-watched via `sync.markWatched` / `sync.clearProgress`. The `(app)`
  layout's sync-store `$effect` detaches only on shell unmount (a separate
  no-dep effect), never as the attach effect's cleanup. `watch.spec.ts` asserts
  an optimistic write still flushes across an immediate navigation.
- Continue-watching (`/`) = a union of the SSR `continueWatching` pull and the
  local progress store — resilient to a slow / failed pull, reflects a
  just-watched episode immediately, local-only titles get meta from the library
  mirror. "In progress" = `duration > 60s` and `position < 90%` — **no lower
  position bound** (the API stores queued titles at `position: 0`; a prior
  `position > 30s` filter dropped every one). Position-0 items show "Not
  started".
- Subtitles served via `/api/subtitle` (SRT→WebVTT, auth-gated).

</details>

## Library, collections & history

- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT` mode. ([x] "All" tab — aggregated, de-duped view across a
      collection's folders, default when there's more than one.)
- [x] Continue-watching was empty / "reset" — the filter required
      `position > 30s` but the API stores queued titles at `position: 0`, so
      everything was dropped; and short watches weren't flushed before a tab
      close. Fixed: no lower position bound, SSR+local-store union, progress
      flushed on pause / hide / unload (see Playback). Verified end-to-end
      (watch → pause → reload resumes, not resets).

<details><summary>Shipped</summary>

- `/stats` — time watched (movies vs shows), finished-movie / show / episode
  counts, preferred format, top genres (`watchStats` remote, from the progress +
  history snapshots; genre tally via `getMeta` on recent unique titles). Linked
  from the profile dropdown.

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
- [x] Right-click add/remove list invalidation — audited: every mutation goes
      through `sync.*` and every consumer (library / history / detail / poster
      badges / home rows) reads the reactive `$state` views, so a right-click
      action propagates without an explicit invalidate.

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
- Theme preferences cached in `localStorage` + a blocking inline script in
  `app.html` paints the accent / AMOLED dataset before first render (no flash);
  the cloud settings still win once they load.

</details>

## Settings & appearance

- [ ] Home layout editor → needs `client.homeCatalog`.

<details><summary>Shipped</summary>

- `/settings` Appearance — mode (system/light/dark), dark style (dim / AMOLED),
  7 accent presets; quick mode toggle in the profile dropdown; per-profile,
  cloud-stored, `ready`-gated so SSR uses server data.
- Playback section — autoplay-next toggle, preferred quality (auto-picks the
  closest resolution from a source list via `pickPreferredStream`, unit-tested),
  preferred subtitle language, subtitle size / colour / background.
- Sync section (scaffold). Addons shortcut card.
- `title` store (`pageTitle`) — `Nuvio · <segment>`, into `<svelte:head>` +
  mirrored to `document.title`, per-page segments, client-only.

</details>

## Profiles & account

Nothing open.

<details><summary>Shipped</summary>

- `/profiles` picker — avatar grid + add-profile dialog; `selectProfile` /
  `createProfile`.
- `/profiles` "Manage profiles" mode — per-profile editor dialog: rename,
  recolour, change avatar, `uses_primary_addons` toggle (non-primary only),
  delete (`updateProfile` / `deleteProfile` forms; delete runs
  `deleteProfileData` then a full-replace, clears the cookie if it was active,
  primary profile protected).
- PIN-protected profiles (`pin_enabled`) show a lock overlay in the picker and
  aren't selectable from the web (no PIN flow in the public API) — a toast
  points to the mobile app.
- App shell — top nav + profile dropdown (switch / settings / account / sign
  out).
- `/account` — email + member-since, change-password link-out, sign out,
  per-profile sync-counts table, danger-zone "clear this profile's data".
- Supporters — footer link goes straight to `nuvio.tv/support` (the in-app wall
  page was removed).

</details>

## Addons

- [ ] Full `addon_catalog` resource browse (an addon that advertises _other_
      addons) — the manifest-`catalogs` list is now shown in the add preview.

<details><summary>Shipped</summary>

- Add-addon preview lists the manifest's catalogs (type + name) so you see what
  a provider brings before installing. Empty-state suggests metadata-only
  providers (Cinemeta, TMDB) with one-click add.
- `/addons` drag-to-reorder — grip handle per row (HTML5 DnD, drop-target ring),
  up/down buttons kept for keyboard.

- Manifest client (`parseAddonUrl`, `fetchManifest` 30-min cache, validate),
  registry (`buildRegistry`, per-addon isolation, `providersFor`), resource
  clients (`getCatalog` / `getMeta` / `getStreams` / `getSubtitles`, fan-out +
  per-addon error isolation, 15s timeout, 5-min response cache).
- `/addons` UI — installed list (logo, resource badges, catalog count,
  unreachable flag), add-by-URL + manifest preview, enable/disable, up/down
  reorder, remove → `saveAddons` full-replace.

</details>

## Polish & hardening

- [~] Mobile-friendly — the small-screen gate is now a dismissable bottom banner
  (`small-screen-notice.svelte`, `localStorage`), so the app is usable on a
  phone. Still open: responsive header (collapse the nav into a burger menu
  below `md`); touch-target / layout polish for small screens.
- [x] Degraded-mode / offline banner (`health-banner.svelte` + `apiHealth`
      remote over `client.healthCheck()`) — full-bleed amber strip on `degraded`
      / `down` (Retry + Dismiss, re-probes every 60s) or when `navigator.onLine`
      is false (auto-clears on reconnect). A dedicated status page is still
      open.
- [~] Image handling — posters / episode thumbs / trailer stills carry
  `loading="lazy"` + `decoding="async"`; responsive `srcset` + `sizes` on poster
  tiles and hero backdrops for TMDB image URLs (`images.ts`, unit-tested;
  Cinemeta/metahub URLs pass through unchanged). A blur-up placeholder is still
  open.
- [ ] Perf — route-level code splitting (SvelteKit does this per route),
      virtualised grids. Prefetch-on-hover is on
      (`data-sveltekit-preload-data`).
- [ ] Accessibility pass — focus management, ARIA on rows/tiles/player (partial;
      reduced-motion honoured).
- [~] Offline states + retry affordances — `health-banner.svelte` handles
  `navigator.onLine`; `query-error.svelte` (message + "Try again" →
  `.refresh()`) on the home rows / discover catalog / collection folders;
  empty-state component + restyled `+error.svelte` done.
- [~] Rate-limit safety — addon fan-out (`AddonClient.fanOut`) is capped at 6
  concurrent upstream requests (`pooledMap`, unit-tested); sync writes already
  batch behind a 1.5s debounce. A global client request budget is still open.

<details><summary>Shipped</summary>

- Auth pages branded — wordmark + tagline, radial glows, scoped-dark.
- Fallback images — poster glyph + gradient, episode-thumbnail and
  continue-watching-card fallbacks with `onerror`.
- No content-await blocks SSR (home / discover / collections / player moved to
  client queries + skeletons). `data.*` guarded everywhere.
- Playwright smoke suite (`e2e/`, reuses the running dev server on :5173, shared
  auth token, zero-console-errors asserted on every page). Vitest (~106 cases:
  `reconcile`, `runtime`, `stream-format`, addon `registry`, `segments`,
  `episodes`, `pool`, `images`, `session`, `guards`, `safe-fetch`,
  `health.remote`, `segments.remote`) with **istanbul** coverage scoped to the
  server / remote-function layer + a ratcheting threshold
  (`bun run test:unit:coverage`, in CI). Run `bun run test:e2e` after any UI
  change.
- Dedicated showcase-screenshot sequence (`e2e/showcase.spec.ts`,
  `bun run screenshots`) — a numbered walkthrough (sign-in → home → discover →
  detail → sources drawer → library → collections → history → stats → settings →
  addons → account → player) for README/release screenshots. Its own Playwright
  project, excluded from `bun run test:e2e`.
- Small-screen gate overlay.

</details>

---

## CI/CD

- [~] **100% unit-test coverage of the server / data layer** — every
  `*.remote.ts`, `src/lib/server/**`, `src/lib/sync/**`, `src/lib/addons/*`,
  `src/lib/watch/*`, `hooks.server.ts`. `vitest.config.ts` scopes coverage to
  these + enforces a ratcheting threshold (`test:unit:coverage`, in CI). Now
  ~27% lines (was ~19). Still 0%: `sync.remote` / `sync/store` / `watch.remote`
  / `stats.remote` / `auth.remote` / `addons.remote` / `library.remote` /
  `history.remote` / `collections.remote` / `profiles.remote` / `hooks.server`.
  Pattern: `vi.mock("$app/server")` so `query`/`command` return the handler,
  fake `getRequestEvent().locals`.
- [ ] Release mechanism (release-please) — screenshot the app for the README,
      publish the Docker image.

<details><summary>Shipped</summary>

- `.github/workflows/ci.yml` — on push / PR: `check`, `lint` (biome + tailwint),
  `test:unit`, `build`. Optional `e2e` job gated on `vars.RUN_E2E` +
  `NUVIO_TEST_EMAIL` / `NUVIO_TEST_PASSWORD` secrets, uploads the Playwright
  report on failure.
- `.github/workflows/nuvio-contract.yml` — daily + manual `bun run nuvio:check`;
  opens a single `api-drift`-labelled issue when the live spec moves.

</details>

## Legal / compliance

The theory: Nuvio web is a shell. Addons (Stremio protocol, user-installed) do
all content provisioning. The app hosts nothing. Items below are where the code
diverges from that or fails to state it.

- [x] **Disclaimer + minimal ToS** — README `## Disclaimer`, an `Alert` at the
      top of `/addons`, and a blocking first-run acknowledgement modal
      (`first-run-notice.svelte`, `localStorage` `nuvio:disclaimer-ack:v1`).
- [x] **`LICENSE` file** — AGPL-3.0-or-later (`LICENSE` + `package.json` +
      README `## License`).
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
- [x] **Never bundle default addons** pointing at infringing sources — the
      `/addons` empty-state suggests only Cinemeta + the TMDB addon
      (metadata-only, `configurationRequired: false`).
- [ ] **Keep playback client-side** — `video.src` / `hls.loadSource` in the
      browser, media never transits our server. No server-side stream proxy.
- [~] **Nuvio affiliation** — app ships a hardcoded `api.nuvio.tv` key, auths
  real users against the Nuvio backend, uses the Nuvio name + logo. README says
  "unofficial". Plan: ask the Nuvio team to review; if they decline, get written
  permission or self-host the backend and drop the marks.

## Open decisions

- **Playable containers.** Scope = direct http(s) mp4 + HLS. External-player
  handoff (`vlc://` / copy URL) for the rest → **done** on the no-playable
  state; a mid-play failure now shows a "Choose another source" overlay
  (`video-player.svelte`).
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
