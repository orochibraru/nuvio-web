# Nuvio web — build plan

The browser build of Nuvio: a full streaming client. Stremio-compatible addon
layer for content (catalog / meta / stream / subtitles) + an in-browser player,
with profiles, library, collections, watch progress and history synced through
the Nuvio public API (`$lib/nuvio`, client methods in
`src/lib/nuvio/client.ts`).

Target: **desktop web only** (mouse + keyboard, large screen). Mobile and TV are
covered by the existing Nuvio mobile app — not our problem. This is net-new:
there is no Nuvio web today, and the desktop experience is what's lacking.

The mobile app is the reference for behaviour the API doesn't pin down: the
shapes of the settings / home-catalog / collections JSON blobs (server enforces
no schema), the progress-key format, and the 90% / 60s completion rule.

---

## Architecture

- **Two data sources.** (1) The Nuvio API — user data only: profiles, the addon
  list, library, watch progress, history, settings, collections. (2) **Addons**
  — the Stremio addon protocol, fetched client-side from each addon's manifest
  URL. All actual content (posters, metadata, episodes, streams, subtitles)
  comes from addons, not from Nuvio.
- **Local store (IndexedDB).** Mirror of the synced library / progress / history
  plus their delta cursors, so screens render instantly and reconcile in the
  background. Also caches addon manifests and catalog/meta responses with a TTL.
- **Sync engine.** Bootstrap = capture cursor → page the snapshot → apply deltas
  since the cursor → persist the max `event_id` (per the spec's incremental-sync
  section). Then delta pulls on an interval and on focus. Writes are optimistic:
  mutate local → enqueue → push. Progress/history use non-destructive merge;
  library uses incremental upsert/delete; addons/collections/profiles/settings
  are full-replace (always send complete state).
- **Current profile.** Every sync RPC needs `p_profile_id`. Track the active
  profile server-side in a cookie; `hooks.server.ts` puts `locals.profileId`
  alongside `locals.nuvio`. No profile selected → routes bounce to `/profiles`.
- **Routing.** `(protected)` = signed in. Nest an app group inside it that also
  requires a selected profile. `/profiles` and `/account` sit in `(protected)`
  but outside the profile-gated group. `/support` is public.
- **IDs.** `content_id` e.g. `tmdb:550`; `content_type` `movie` | `series`.
  Episodes: `video_id` `tmdb:1396:1:1` + `season`/`episode`. The server computes
  `progress_key`.
- **Zero config.** No env vars. The app ships pointed at the hosted Nuvio API
  (the publishable key is public and lives in `client.ts`). The one allowed
  override is `NUVIO_API_URL` for the handful of self-hosters — read once in
  `hooks.server.ts`, nowhere else.

---

## Phase 0 — Foundation

- [x] Typed Nuvio API client — `src/lib/nuvio/` (`types.ts` + `NuvioRpcMap`,
      `client.ts`)
- [x] Auth: `/auth/sign-in`, `/auth/sign-up`, httpOnly-cookie session, route
      guards
- [x] Spec drift check — `bun run nuvio:check`
- [x] Root `+error.svelte` + `App.Error` shape (`errorId`); `handleError` in
      `hooks.server.ts`
- [x] `mode-watcher` (`<ModeWatcher/>` in root layout); theme→settings-blob
      wiring comes with Phase 7
- [x] Toast host — `<Toaster/>` (sonner) in root layout
- [x] Core shadcn components added:
      `button card input field label separator alert spinner avatar badge skeleton tooltip dialog dropdown-menu sonner`.
      Add the rest per-phase:
      `sheet tabs scroll-area select slider switch toggle-group progress popover command`
- [ ] (low priority) Single optional `NUVIO_API_URL` override for self-hosters —
      passed to `NuvioClient` in `hooks.server.ts` when set, default otherwise.
      No other env vars anywhere; the app runs against the hosted API with zero
      config.

## Phase 1 — Profiles & app shell

- [x] `locals.profileId` from the `nuvio_profile` cookie; profile-gate in
      `(protected)/(app)/+layout.server.ts`
- [x] `profiles.remote.ts`: `selectProfile` (form → cookie → `/`),
      `createProfile` (form → full-replace push → cookie → `/`)
- [x] `/profiles` — picker: avatar grid + "add profile" dialog (name / catalog
      avatar / colour)
- [x] Avatar picker: `client.listAvatars()` catalog + `avatar_color_hex`
      fallback; `client.avatarUrl()` resolves `storage_path`
- [x] App shell — `(app)/+layout.svelte`: top nav (Home / Discover / Library /
      Collections / Search) + profile dropdown (switch / settings / account /
      sign out)
- [x] Stub pages: `/discover`, `/library`, `/collections`, `/search`
- [ ] Profile "manage" mode: rename, recolour, custom `avatar_url`, delete —
      `saveProfiles` (full-replace) + `deleteProfileData`
      (`client.profiles.deleteData`). Show PIN-locked profiles as locked
      (read-only, no PIN flow in the public API)
- [ ] `PosterTile`, `ContentRow` (horizontal scroll + arrows), `HeroBanner`,
      `RatingBadge`, skeleton variants — build when Phase 4 first needs them
- [ ] Loading / empty / error state pattern for data screens

## Phase 2 — Local store & sync engine

`src/lib/sync/`: `idb.ts` (dep-free IndexedDB wrapper, stores
`library`/`progress`/ `history`/`meta`, keyed `${profileId}:${identity}`,
degrades to no-op when IDB is unavailable), `reconcile.ts` (pure delta-fold,
Vitest target), `sync.remote.ts` (`syncSnapshot` / `syncDeltas` / `flushWrites`
— the only network layer), `store.svelte.ts` (`sync` singleton, `$state` views +
optimistic mutators). `+page.server.ts` loads stay for SSR / first paint; pages
read `sync.ready ? store : data.X`.

- [x] IndexedDB wrapper (`library`, `progress`, `history`, `meta` = cursors +
      queue + bootstrapped flag). `addonCache` still on the addon layer's
      in-memory `TtlCache`
- [x] Bootstrap: `syncSnapshot` reads all three delta cursors _before_ paging
      the snapshot; `syncDeltas` then catches anything that moved during paging.
      `bootstrapped` flag in `meta` so it runs once per device/profile
- [x] Library / progress / history delta pulls on an interval (90s) + on
      `visibilitychange` + 4s after attach (deferred so it doesn't fight first
      paint). Applied by `event_id` asc, identity `(type,id)` / `progress_key` /
      `(id,season,episode)`
- [x] Write queue: optimistic local mutate → enqueue (collapsing repeats on same
      target) → 1.5s-debounced `flushWrites` →
      `upsertItems`/`deleteItems`/`watchProgress.push`/`watchHistory.delete`
      with `p_origin_client_id: "nuvio-web"` + 500-item batching. Survives
      reload (persisted to `meta`), retries on the next sync tick
- [x] Reconcile: `reconcileDeltas` (last-write-wins by `event_id`);
      `overlayPendingLibrary` / `overlayPendingProgress` re-apply still-queued
      writes so a pull that lands before our push doesn't flicker
- [x] Scheduler: 4s-after-attach + 90s interval + focus + implicit after every
      write (debounced flush)
- [x] `$state` views: `sync.library` / `sync.progress` / `sync.history`
      (sorted), `sync.libraryProgress` / `sync.titleProgress()` /
      `sync.isInLibrary()`. Wired into `/library`, `/history`, `/detail`
      (in-library + resume/watched), `/watch` (`saveProgress`). Home
      continue-watching keeps its meta-enriched `continueWatching` query
- [x] Unit tests — `src/lib/sync/reconcile.test.ts`, 17 cases
      (`bun run test:unit`)
- [ ] `continueWatching` from the local progress store (needs poster/title —
      either enrich from the library mirror or a cached meta lookup)

## Phase 3 — Addon subsystem

`src/lib/addons/` (framework-agnostic) + `src/lib/addons/addons.remote.ts`
(server-side remote fns).

- [x] Manifest client — `manifest.ts`: `parseAddonUrl` (strips
      `/manifest.json`), `fetchManifest` (30-min cache, 10s timeout),
      `validateManifest` (normalizes `resources` string|object)
- [x] Addon registry — `registry.ts`: `buildRegistry(nuvioRows, fetch)`
      (per-addon isolation, collects load errors), `AddonRegistry` —
      `catalogs()`, `findCatalog()`, `providersFor(resource, type, id)`
      respecting resource strings vs objects + manifest/resource `idPrefixes` +
      `types`
- [x] Resource clients — `client.ts` `AddonClient`: `getCatalog`
      (`genre`/`skip`/`search` extra), `getMeta` (first provider wins),
      `getStreams` / `getSubtitles` (fan out, per-addon error isolation →
      `AddonError[]`), 15s timeout, 5-min response cache (streams/subs uncached)
- [x] Response cache with TTL — `TtlCache` (in-memory, per server instance).
      IndexedDB upgrade deferred to Phase 2 if needed
- [x] `/addons` management UI: installed list (logo, resource badges, catalog
      count, unreachable flag), add-by-URL with manifest preview, enable/disable
      switch, up/down reorder, remove → `saveAddons` command (full-replace via
      `client.addons.replace`). In the profile dropdown nav
- [x] CORS: addon fetches run server-side (remote fns), so no browser CORS.
      Unreachable addons surfaced in the UI; a server-side addon proxy stays out
      of scope
- [x] Remote queries for Phase 4: `browseCatalog`, `catalogList`, `getMeta` in
      `addons.remote.ts`
- [ ] `uses_primary_addons` toggle for non-primary profiles (needs profile-1
      addon context) — deferred to profile "manage" work
- [ ] Addon catalog discovery (`addon_catalog` resource) — browse an addon's
      advertised catalogs before adding — deferred
- [ ] Drag reorder (currently up/down buttons)

## Phase 4 — Browsing

Primitives in `src/lib/components/` (`media-poster`, `media-grid`, `media-row`,
`stream-list`). Content via the Phase 3 remote queries; pages use
`+page.server.ts` loads that `await` them (real SSR).

- [x] Home `/` — `+page.server.ts` → `homeRows` (first 8 catalogs, 20 items
      each) + `libraryItems` row. Hero + `client.homeCatalog.pull` ordering +
      continue-watching still to do (needs Phase 2)
- [x] Discover `/discover?c=<addon|type|catalog>&g=<genre>` — catalog pills +
      genre pills + `MediaGrid` + "Load more" (`browseCatalog` with `skip`)
- [x] Search `/search?q=` — `searchCatalogs` fans out to `search`-capable
      catalogs server-side, dedupes by `type:id`, grouped Movies / Series /
      Other. (`command`-palette nav search deferred)
- [x] Detail `/detail/[type]/[id]` — `getMeta`: backdrop + poster +
      title/year/runtime/genres/rating, description, cast/director
- [x] Detail actions: Add to / Remove from library (`library.remote.ts`
      `toggleLibrary` → `client.library.upsertItems`/`deleteItems`,
      `p_origin_client_id: "nuvio-web"`). Play → streams; "Mark watched" + share
      deferred
- [x] Series: season pills + episode list (thumb, title, aired date).
      Per-episode resume bar + watched tick via `titleProgress` query
      (`$lib/watch`); series CTA resolves to Resume S_E_ / next-unwatched.
      Library grid cards get resume bars via `libraryProgress`
- [x] `StreamList` — lazy `getStreams`, per-stream Play/Open link (opens
      `url`/`externalUrl` in a tab until Phase 6 player), `not web-ready`
      flagged, addon badge. Grouping/sort/remember-choice deferred
- [ ] Home layout editor (in Settings) → Phase 7
- [ ] Hero banner on home; continue-watching row; watched/resume indicators →
      after Phase 2

## Phase 5 — Library, collections, history

`$lib/{library,history,collections}/*.remote.ts`. Shared `$lib/server/guards.ts`
`requireProfile`, `$lib/addons/server.ts` (`getRegistry`/`getAddonClient`,
extracted from `addons.remote.ts`). Pages use `+page.server.ts` loads. Direct
API writes for now; Phase 2 wraps them in the queue.

- [x] `/library` — grid from `libraryItems`, filter all/movie/series, sort
      recent/name, hover-remove → `toggleLibrary({remove:true})`
- [x] `/history` — `watchHistory` grouped Today / Yesterday / weekday / date,
      per-row delete → `watchHistory.delete`
- [x] `/collections` — list (pin-sorted), create / rename / pin / delete →
      `saveCollections` (full-replace)
- [x] `/collections/[id]` — `collectionContents` resolves each folder's
      `catalogSources` via the addon client; `TABBED_GRID` (folder tabs) /
      `ROWS` view toggle; add folder (title + catalog multi-pick from
      `catalogList`); delete folder
- [ ] Folder reorder, tile shape / hide-title / cover image, `FOLLOW_LAYOUT`
      mode, "All" tab — later
- [ ] Sort by rating; library from the local store instead of a live pull — with
      Phase 2

## Phase 6 — Playback

`$lib/watch/`: `watch.remote.ts` (`playbackContext` — meta/resume/next, no
streams; `resolveStreams` — the slow fan-out, client-side; `getSubtitles`,
`titleProgress`, `continueWatching`), `stream-format.ts` (pure `describeStream`
/ `formatFileSize` / `isPlayable`, Vitest'd), `playback.ts` (`playbackHandoff` —
sessionStorage-backed stream handoff, streams→player).

**Flow (mirrors the Nuvio apps):** `/detail` → `/streams/[type]/[id]` (SSR
heading paints instantly, stream list fans out client-side via
`resolveStreams.current` with a skeleton + a "Refresh" button) → pick →
`/player/[type]/[id]` (whole-page surface: `(app)/+layout` drops all chrome when
the path starts `/player/`). Continue-watching tiles jump straight to
`/player/*`.

- [x] `VideoPlayer` — `hls.js` for `.m3u8`, native `<video>` otherwise; `fill`
      prop for the full-page player; `onSources` button; `object-contain` so odd
      aspect ratios letterbox
- [x] `/streams/[type]/[id]` — instant SSR shell + async source list,
      quality/feature chips + size + addon badge from `describeStream`,
      "Refresh" re-runs the query, next-episode card
- [x] `/player/[type]/[id]` — reads the handoff (or cold-resolves + auto-picks
      the first playable), resume prompt, up-next autoplay, `onSources` → back
      to `/streams`
- [x] Custom controls: play/pause, seek bar with buffered range, time, volume,
      playback rate, PiP, fullscreen, captions toggle + menu; auto-hide;
      keyboard (space/k, ←→/jl, ↑↓, f, m, c)
- [x] Resume: `startTime` seek on `loadedmetadata`
- [x] Progress → `sync.saveProgress` (optimistic, batched) every 15s + on
      unmount
- [x] Subtitles: `getSubtitles` (dedupe by lang) → `<track>` via `/api/subtitle`
      proxy (SRT→WebVTT, auth-gated)
- [x] Next-episode autoplay + "up next" card — `playbackContext.next`;
      end-of-episode overlay with a 10s countdown (gated on `autoPlayNext`)
- [ ] Subtitle size/colour/offset controls; audio-track selection; "mark
      watched" button

## Phase 7 — Settings

Blob lives at `client.settings.pull/replace` with `p_platform: "web"`, shape
owned by us, `uiVersion` in the blob. `src/lib/settings/`: `ui-settings.ts`
(schema/types — kept out of the `.remote.ts` file since SvelteKit rejects
non-remote exports there), `settings.remote.ts`
(`getUiSettings`/`saveUiSettings`), `theme.svelte.ts` (client controller,
`ready`-gated so SSR uses server data — no accent/amoled flash).

- [x] `/settings` Appearance: mode (system / light / dark), dark style (dim /
      **AMOLED** = pure black), accent colour (7 presets → `--primary`/`--ring`
      via `[data-accent]` on the app wrapper + `<html>`)
- [x] Quick mode toggle in the profile dropdown
- [x] Per-profile, cloud-stored; `mode-watcher` handles the light/dark
      mechanism, we layer cloud sync + accent + amoled on top
- [x] Playback section on `/settings`: "Autoplay next episode" toggle
      (`autoPlayNext` in `uiSettingsSchema`, defaults on)
- [ ] Player defaults: quality, subtitle language, subtitle appearance
- [ ] Home layout editor (Phase 4 rows) → needs `client.homeCatalog`
- [ ] Addon shortcut card into `/addons`

## Phase 8 — Account, polish, hardening

- [x] `/account` (in `(app)`): email + member-since, change-password link-out to
      nuvio.tv (no API method), sign out, per-profile sync counts table
      (`getSyncOverview` via `account.remote.ts`), danger-zone "clear this
      profile's data" (`profiles.deleteData`) behind a confirm dialog
- [x] Sync status: per-profile counts table on `/account`. Last-sync time +
      write-queue size wait on Phase 2
- [x] `/support` (public, outside `(protected)`): Supporter Wall —
      `getSupporterWall` via `support.remote.ts`, Top + Recently-joined grids,
      offset pagination, become-a-supporter link. Linked from the app footer
- [ ] Health indicator using `client.healthCheck()` / `client.healthPing()` for
      a status page or degraded-mode banner
- [~] Error / empty / offline states across every screen; retry affordances —
  shared `empty-state.svelte` on library / history / collections / discover /
  watch / search; `+error.svelte` restyled. Offline + retry still open
- [~] Visual pass ("sexy af"): cinematic full-bleed `media-hero.svelte` (home
  spotlight + detail), scroll-aware transparent header, hover-lift posters with
  scroll-button rails, shimmer skeletons, ambient accent glow, `N` wordmark.
  Tokens/utilities in `layout.css` (`skeleton`, `no-scrollbar`,
  `animate-hero-zoom`)
- [ ] Image handling: lazy-load, decode async; decide on a poster proxy route
      (CORS + resize + cache) vs raw `<img>`
- [~] Accessibility pass: focus management, ARIA on rows/tiles/player,
  reduced-motion — hero/skeleton honour `prefers-reduced-motion`; full pass
  still open
- [ ] Perf: route-level code splitting, virtualized grids for large libraries,
      prefetch on hover
- [~] Tests: **Playwright smoke suite in `e2e/`** (`bun run test:e2e`, own dev
  server on :4173, real API via `NUVIO_TEST_*` in `.env`) — every route
  renders + client-nav + detail library toggle, all asserting no runtime errors.
  **Vitest** (`bun run test:unit`) covers `src/lib/sync/reconcile.ts`. Still to
  add: Vitest for the addon registry. **Run `bun run test:e2e` after any UI
  change** (also in CLAUDE.md)
- [ ] Rate-limit safety: keep per-user request rate well under 100 req/s; batch
      via RPC
- [x] Small-screen gate: `small-screen-notice.svelte` in the root layout,
      `md:hidden` full-screen overlay pointing phone/tablet users at the mobile
      app

---

## Open decisions

- **Playable containers.** Browsers can't play most mkv/torrent streams. Scope =
  direct http(s) mp4 + HLS. Decide whether to offer an "open in external player"
  handoff (e.g. `stremio://` / copy stream URL) for the rest.
- **Poster proxy.** Build a `/img` proxy route (CORS, resize, cache) or rely on
  addon-provided URLs directly?
- **Addon CORS.** Some addons don't send CORS headers for browser origins.
  Optional server-side addon proxy route to work around it — decide if that's in
  scope.
- **Offline.** How far does the local store go — read-only browsing offline, or
  also queueing writes offline (already implied by the write queue)?
- **Legacy library push.** Stay on incremental `upsertItems`/`deleteItems`;
  never call the legacy full-replace `client.library.replaceLegacy`.
- **Trailer playback.** YouTube embed vs skip.
- **Multi-tab.** BroadcastChannel to keep the local store / player state
  coherent across tabs?
