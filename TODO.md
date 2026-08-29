# Nuvio web — build plan

The browser build of Nuvio: a full streaming client. Stremio-compatible addon
layer for content (catalog / meta / stream / subtitles) + an in-browser player,
with profiles, library, collections, watch progress and history synced through
the Nuvio public API (`$lib/nuvio`, client methods in `src/lib/nuvio/client.ts`).

Target: **desktop web only** (mouse + keyboard, large screen). Mobile and TV are
covered by the existing Nuvio mobile app — not our problem. This is net-new:
there is no Nuvio web today, and the desktop experience is what's lacking.

The mobile app is the reference for behaviour the API doesn't pin down: the
shapes of the settings / home-catalog / collections JSON blobs (server enforces
no schema), the progress-key format, and the 90% / 60s completion rule.

---

## Architecture

- **Two data sources.** (1) The Nuvio API — user data only: profiles, the addon
  list, library, watch progress, history, settings, collections. (2) **Addons** —
  the Stremio addon protocol, fetched client-side from each addon's manifest URL.
  All actual content (posters, metadata, episodes, streams, subtitles) comes from
  addons, not from Nuvio.
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

- [x] Typed Nuvio API client — `src/lib/nuvio/` (`types.ts` + `NuvioRpcMap`, `client.ts`)
- [x] Auth: `/auth/sign-in`, `/auth/sign-up`, httpOnly-cookie session, route guards
- [x] Spec drift check — `bun run nuvio:check`
- [x] Root `+error.svelte` + `App.Error` shape (`errorId`); `handleError` in `hooks.server.ts`
- [x] `mode-watcher` (`<ModeWatcher/>` in root layout); theme→settings-blob wiring comes with Phase 7
- [x] Toast host — `<Toaster/>` (sonner) in root layout
- [x] Core shadcn components added: `button card input field label separator alert spinner avatar badge skeleton tooltip dialog dropdown-menu sonner`. Add the rest per-phase: `sheet tabs scroll-area select slider switch toggle-group progress popover command`
- [ ] (low priority) Single optional `NUVIO_API_URL` override for self-hosters — passed to `NuvioClient` in `hooks.server.ts` when set, default otherwise. No other env vars anywhere; the app runs against the hosted API with zero config.

## Phase 1 — Profiles & app shell

- [x] `locals.profileId` from the `nuvio_profile` cookie; profile-gate in `(protected)/(app)/+layout.server.ts`
- [x] `profiles.remote.ts`: `selectProfile` (form → cookie → `/`), `createProfile` (form → full-replace push → cookie → `/`)
- [x] `/profiles` — picker: avatar grid + "add profile" dialog (name / catalog avatar / colour)
- [x] Avatar picker: `client.listAvatars()` catalog + `avatar_color_hex` fallback; `client.avatarUrl()` resolves `storage_path`
- [x] App shell — `(app)/+layout.svelte`: top nav (Home / Discover / Library / Collections / Search) + profile dropdown (switch / settings / account / sign out)
- [x] Stub pages: `/discover`, `/library`, `/collections`, `/search`
- [ ] Profile "manage" mode: rename, recolour, custom `avatar_url`, delete — `saveProfiles` (full-replace) + `deleteProfileData` (`client.profiles.deleteData`). Show PIN-locked profiles as locked (read-only, no PIN flow in the public API)
- [ ] `PosterTile`, `ContentRow` (horizontal scroll + arrows), `HeroBanner`, `RatingBadge`, skeleton variants — build when Phase 4 first needs them
- [ ] Loading / empty / error state pattern for data screens

## Phase 2 — Local store & sync engine

- [ ] IndexedDB wrapper (schema: `library`, `watchProgress`, `watchHistory`, `cursors`, `writeQueue`, `addonCache`)
- [ ] Library sync: bootstrap (`client.library.deltaCursor` → `client.library.pull` pages → `client.library.pullDelta`), then delta pulls; apply events by `event_id` asc, identity `(content_type, content_id)`
- [ ] Watch progress sync: `client.watchProgress.deltaCursor` / `pull` / `pullDelta`; same event-cursor pattern
- [ ] Watch history sync: `client.watchHistory.deltaCursor` / `pull` / `pullDelta`
- [ ] Write queue: optimistic local mutation + enqueue + flush → `client.library.upsertItems` / `deleteItems`, `client.watchProgress.push`, `client.watchHistory.push`, with `p_origin_client_id` (stable per-install id) and 500-item batching
- [ ] Reconcile / dedupe on delta arrival; last-write-wins
- [ ] Sync scheduler: on profile load, on window focus, on interval, after writes
- [ ] `$state`-based stores exposing `library`, `continueWatching` (from progress), `history` to components
- [ ] Unit tests for the reconcile / cursor logic (Vitest)

## Phase 3 — Addon subsystem

`src/lib/addons/` (framework-agnostic) + `src/lib/addons/addons.remote.ts` (server-side remote fns).

- [x] Manifest client — `manifest.ts`: `parseAddonUrl` (strips `/manifest.json`), `fetchManifest` (30-min cache, 10s timeout), `validateManifest` (normalizes `resources` string|object)
- [x] Addon registry — `registry.ts`: `buildRegistry(nuvioRows, fetch)` (per-addon isolation, collects load errors), `AddonRegistry` — `catalogs()`, `findCatalog()`, `providersFor(resource, type, id)` respecting resource strings vs objects + manifest/resource `idPrefixes` + `types`
- [x] Resource clients — `client.ts` `AddonClient`: `getCatalog` (`genre`/`skip`/`search` extra), `getMeta` (first provider wins), `getStreams` / `getSubtitles` (fan out, per-addon error isolation → `AddonError[]`), 15s timeout, 5-min response cache (streams/subs uncached)
- [x] Response cache with TTL — `TtlCache` (in-memory, per server instance). IndexedDB upgrade deferred to Phase 2 if needed
- [x] `/addons` management UI: installed list (logo, resource badges, catalog count, unreachable flag), add-by-URL with manifest preview, enable/disable switch, up/down reorder, remove → `saveAddons` command (full-replace via `client.addons.replace`). In the profile dropdown nav
- [x] CORS: addon fetches run server-side (remote fns), so no browser CORS. Unreachable addons surfaced in the UI; a server-side addon proxy stays out of scope
- [x] Remote queries for Phase 4: `browseCatalog`, `catalogList`, `getMeta` in `addons.remote.ts`
- [ ] `uses_primary_addons` toggle for non-primary profiles (needs profile-1 addon context) — deferred to profile "manage" work
- [ ] Addon catalog discovery (`addon_catalog` resource) — browse an addon's advertised catalogs before adding — deferred
- [ ] Drag reorder (currently up/down buttons)

## Phase 4 — Browsing

Primitives in `src/lib/components/` (`media-poster`, `media-grid`, `media-row`, `stream-list`).
Content via the Phase 3 remote queries; pages use `+page.server.ts` loads that `await` them (real SSR).

- [x] Home `/` — `+page.server.ts` → `homeRows` (first 8 catalogs, 20 items each) + `libraryItems` row. Hero + `client.homeCatalog.pull` ordering + continue-watching still to do (needs Phase 2)
- [x] Discover `/discover?c=<addon|type|catalog>&g=<genre>` — catalog pills + genre pills + `MediaGrid` + "Load more" (`browseCatalog` with `skip`)
- [x] Search `/search?q=` — `searchCatalogs` fans out to `search`-capable catalogs server-side, dedupes by `type:id`, grouped Movies / Series / Other. (`command`-palette nav search deferred)
- [x] Detail `/detail/[type]/[id]` — `getMeta`: backdrop + poster + title/year/runtime/genres/rating, description, cast/director
- [x] Detail actions: Add to / Remove from library (`library.remote.ts` `toggleLibrary` → `client.library.upsertItems`/`deleteItems`, `p_origin_client_id: "nuvio-web"`). Play → streams; "Mark watched" + share deferred
- [x] Series: season pills + episode list (thumb, title, aired date) → per-episode `StreamList`. Watched tick / resume bar deferred (Phase 2)
- [x] `StreamList` — lazy `getStreams`, per-stream Play/Open link (opens `url`/`externalUrl` in a tab until Phase 6 player), `not web-ready` flagged, addon badge. Grouping/sort/remember-choice deferred
- [ ] Home layout editor (in Settings) → Phase 7
- [ ] Hero banner on home; continue-watching row; watched/resume indicators → after Phase 2

## Phase 5 — Library, collections, history

- [ ] `/library`: grid, filter movie/series, sort (added / name / rating), remove; renders from the local store (library items carry name/poster/etc, no addon call needed)
- [ ] `/collections`: list; create/rename/delete; `pinToTop`; per-collection `viewMode` (`TABBED_GRID` | `ROWS` | `FOLLOW_LAYOUT`)
- [ ] `/collections/{id}`: folders (cover image / emoji, tile shape, hide-title), each folder pulls from its `catalogSources` (`addonId` + `type` + `catalogId`); "All" tab when `showAllTab`
- [ ] Collection editor: add/reorder folders, attach catalog sources → `client.collections.replace` (full-replace JSON blob)
- [ ] `/history`: reverse-chronological list from the history store; delete entries → `client.watchHistory.delete` (by `content_id`, or `+season/episode` for episodes)

## Phase 6 — Playback

- [ ] `VideoPlayer` component: `<video>` + `hls.js` for `.m3u8`; native for progressive mp4; detect + surface "unsupported container" for mkv/other
- [ ] Player route/overlay `/watch/{type}/{id}[/{video}]`: chosen stream, poster as placeholder, custom controls (play/pause, seek bar with buffered ranges, volume, PiP, fullscreen, playback rate)
- [ ] Resume: prompt from stored `position`; seek on load
- [ ] Progress reporting → `client.watchProgress.push` throttled (~every 15s + on pause/seek/exit), min-delta guard; `last_watched` = now
- [ ] Completion: at ≥90% with duration ≥60s the server also writes history (per spec); still push an explicit history entry on "mark watched"
- [ ] Subtitles: fetch from `subtitles` resource or local file; SRT→VTT parse; overlay renderer with size / color / background / timing-offset controls; language menu
- [ ] Next-episode autoplay (respect the `auto_play_next` setting); "up next" card
- [ ] Keyboard shortcuts (space, ←/→, ↑/↓, f, m, c, n)
- [ ] Track selection (audio/subtitle) when the container exposes multiple

## Phase 7 — Settings

Blob lives at `client.settings.pull/replace` with `p_platform: "web"`, shape owned by us,
`uiVersion` in the blob. `src/lib/settings/`: `ui-settings.ts` (schema/types — kept out of the
`.remote.ts` file since SvelteKit rejects non-remote exports there), `settings.remote.ts`
(`getUiSettings`/`saveUiSettings`), `theme.svelte.ts` (client controller, `ready`-gated so SSR
uses server data — no accent/amoled flash).

- [x] `/settings` Appearance: mode (system / light / dark), dark style (dim / **AMOLED** = pure black), accent colour (7 presets → `--primary`/`--ring` via `[data-accent]` on the app wrapper + `<html>`)
- [x] Quick mode toggle in the profile dropdown
- [x] Per-profile, cloud-stored; `mode-watcher` handles the light/dark mechanism, we layer cloud sync + accent + amoled on top
- [ ] Player defaults (quality, subtitle language, subtitle appearance), `auto_play_next` → with Phase 6
- [ ] Home layout editor (Phase 4 rows) → needs `client.homeCatalog`
- [ ] Addon shortcut card into `/addons`

## Phase 8 — Account, polish, hardening

- [ ] `/account`: email, change password (if the API supports it — otherwise link out), sign out everywhere, delete profile data (`client.profiles.deleteData`)
- [ ] Sync status widget: `client.getSyncOverview()` counts per profile + last-sync time + pending write-queue size
- [ ] `/support` (public): Supporter Wall — `client.getSupporterWall()` Top / Recent tabs, pagination
- [ ] Health indicator using `client.healthCheck()` / `client.healthPing()` for a status page or degraded-mode banner
- [ ] Error / empty / offline states across every screen; retry affordances
- [ ] Image handling: lazy-load, decode async; decide on a poster proxy route (CORS + resize + cache) vs raw `<img>`
- [ ] Accessibility pass: focus management, ARIA on rows/tiles/player, reduced-motion
- [ ] Perf: route-level code splitting, virtualized grids for large libraries, prefetch on hover
- [ ] Tests: Vitest for sync engine + addon registry; Playwright smoke flow (sign in → pick profile → add addon → browse → open detail → play → progress persists)
- [ ] Rate-limit safety: keep per-user request rate well under 100 req/s; batch via RPC

---

## Open decisions

- **Playable containers.** Browsers can't play most mkv/torrent streams. Scope = direct http(s) mp4 + HLS. Decide whether to offer an "open in external player" handoff (e.g. `stremio://` / copy stream URL) for the rest.
- **Poster proxy.** Build a `/img` proxy route (CORS, resize, cache) or rely on addon-provided URLs directly?
- **Addon CORS.** Some addons don't send CORS headers for browser origins. Optional server-side addon proxy route to work around it — decide if that's in scope.
- **Offline.** How far does the local store go — read-only browsing offline, or also queueing writes offline (already implied by the write queue)?
- **Legacy library push.** Stay on incremental `upsertItems`/`deleteItems`; never call the legacy full-replace `client.library.replaceLegacy`.
- **Trailer playback.** YouTube embed vs skip.
- **Multi-tab.** BroadcastChannel to keep the local store / player state coherent across tabs?
