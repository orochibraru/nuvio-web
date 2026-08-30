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
- [x] A fuller details page for every media:
  - [x] **Cast** section — names (photos need a TMDB addon; Cinemeta is
        names-only). Chips / row.
  - [x] **Trailers** — `meta.trailerStreams` (`{title, ytId}`), thumbnail cards
        → `trailer-modal.svelte` with a `youtube-nocookie.com/embed/<ytId>`
        iframe.
  - [x] Expanded facts — country, awards, released date, writer(s), full genre
        list.
  - [x] **"More like this"** row — no true "similar" endpoint anywhere
        (Cinemeta/Nuvio-API). MVP: `similarTitles` remote query = browse the
        primary catalog filtered by the title's top genre, drop the current id.
  - [x] **Series episodes → season carousel.** `season-carousel.svelte`
        (replaced the accordion — hard to navigate): scrollable season pills + a
        horizontal, snap-scrolling row of 16:9 episode cards (number, title,
        synopsis, per-episode IMDb rating, air date, runtime fallback to the
        series runtime) with hover arrows. Resume bar / watched tick /
        mark-watched toggle kept; hover warms that episode's streams.
  - [x] **Fuller show detail** — episodes carousel sits directly under the hero
        (primary content for a series); the hero meta line carries `meta.status`
        ("Ended" / "Continuing") for series; the carousel header shows
        `N seasons · M episodes`.
- [ ] Make the UI sexier, colorfoul, playful. We need to WANT to use it not just
      have to (background blurs, color accents, custom backgrounds)
- [ ] Home layout editor (in Settings) → Phase 7
- [ ] Hero banner on home; continue-watching row; watched/resume indicators →
      after Phase 2
- [x] Search page: auto-search on type with a debounce → 450ms debounce pushes
      the query into `?q=` (`replaceState`, so back isn't polluted per
      keystroke); Enter still searches immediately; `afterNavigate` re-syncs the
      box on back/forward. Results are the `searchCatalogs` remote query, which
      is client-cached by args — retyping a prior term is a cache hit, no
      refetch.
- [x] The streams drawer shouldn't be url based it has a big impact on UX when
      trying to navigate to the previous page. → now `sources-panel.svelte.ts`
      module state, owned by the `(watch)` layout. Opening / closing it never
      touches history; back leaves the page.
- [x] The home hero should be a carousel that's auto-scrolling and allows the
      user to see next featured media → `+page.server.ts` returns `spotlights`
      (up to 6 backdropped titles, deduped + shuffled); the home hero cycles
      them every 8s (pauses on hover/focus, off under `prefers-reduced-motion`)
      with dot indicators + prev/next arrows in a new `MediaHero` `overlay`
      snippet. `{#key spotlight.id}` replays the Ken-Burns zoom on each change.
- [x] Continue watching cards should show how much time is remaining →
      `continueWatching` returns `remainingMs`; the home card shows
      `formatRemaining()` ("23 min left" / "1 h 12 min left" / "Almost done",
      unit-tested in `runtime.test.ts`).
- [x] Each time we display a rating, show where it comes from (IMDB, TVDB?) →
      every rating we render is Cinemeta's `imdbRating` (or `MetaVideo.rating`,
      normalised from it), so it's labelled **IMDb**: an inline "IMDb" tag on
      the `media-hero` and `episode-accordion` ratings, `title="IMDb rating"` on
      the compact `media-poster` badge. If an addon ever gives a real source
      field, revisit.
- [x] Create a svelte store called "title". `pageTitle` in
      `$lib/stores/title.svelte.ts` — `Nuvio · ${segment}` (plain `Nuvio` when
      unset). Root layout renders it into `<svelte:head>` and mirrors it to
      `document.title` in an `$effect` (a view transition can swallow the head
      update). Each page sets its segment at script top (static) or in an
      `$effect` (data-driven: detail = `meta.name`, player = `context.heading`,
      collection = folder title, search = the query). Client-only so the module
      singleton can't leak one request's title into another during SSR;
      `beforeNavigate` clears it between pages.
- [x] Preload streams on the detail page so the source drawer / player feel
      instant. `resolveStreams` + `playbackContext` are warmed ~700ms after
      `getMeta` lands for the CTA target (movie id, or resume / first episode);
      remote queries are client-cached by args so the drawer and player reuse
      the result. Hovering an episode in the accordion warms that episode too
      (`onPrefetch`). One id at a time — no episode-by-episode sweep, to stay
      clear of the addon rate limits.
- [ ] Add a right click action on media such as episode or movie cards with
      quick actions such as "add to watchlist" or "mark as watched" or "mark all
      previous episodes as watched". On season cards (season 1, 2 etc... on the
      episode carousel) also add a right click dropdown that allows to mark the
      whole season as watched or this season and all the previous ones.

## Phase 6b — Player UX overhaul

The player controls are weak and the source picker requires leaving the player.

- [x] **Source switch from the player.** `(watch)` route group `+layout.svelte`
      wraps both `/detail` and `/player` (URLs unchanged), owns the drawer via
      `sources-panel.svelte.ts` module state (not the URL — opening it doesn't
      push history) and the `<StreamPanel>` mount. `stream-panel.svelte` fetches
      its own `playbackContext`; `playback.ts` → `playback.svelte.ts` so the
      picked stream is `$state`. `resolveStreams` is client-cached by args so
      moving detail ↔ player doesn't re-resolve.
- [x] **Better controls** — redesigned `video-player.svelte`: large centre
      transport cluster (±10s skip flanking a big play/pause, replay icon when
      ended), thicker scrubber that grows on hover with a time-preview tooltip +
      buffered range, always-visible volume slider, size-9 hit targets, a clean
      rate / PiP / fullscreen / captions cluster. Auto-hide + all shortcuts
      kept.
- [x] **Subtitle overlay** — a dedicated in-player panel (captions button, not
      the settings cog): "Off" + every option with language name
      (`Intl.     DisplayNames`), source addon and an SDH badge. `getSubtitles`
      now returns `{ id, lang, url, addonName, sdh }` (one row per source,
      exact-URL dedupe only); `client.getSubtitles` carries `addonName` via
      `SubtitleWithSource`. Appearance controls (size / colour / plate) live
      alongside and persist through `onSubtitleAppearance` → `saveUiSettings`.
- [x] **Content-warning card** on stream load — `playback-loading.svelte` shows
      the certification (`playbackContext.certification`: `meta.certification`
      when an addon supplies one, else `18+` for `behaviorHints.adult`; Cinemeta
      gives neither) big for ~3.2s, plus genre descriptors, with a soft fade.
      Falls back to just genres when there's no rating.

## Phase 5c — Alternative sync backends (Trakt / SIMKL)

Nuvio (mobile) lets you pick the **library source** and the **watch-progress
source** independently from: Nuvio Sync (default), Trakt, or SIMKL. **The Nuvio
public API does NOT proxy Trakt/SIMKL** — the mobile app talks to them directly.
So this is a real integration, not a setting:

- [x] Settings scaffold — a "Sync" card in `/settings` with two segmented
      selectors ("Library from" / "Watch progress from"), stored in
      `uiSettingsSchema` (`librarySource`, `progressSource`; `SYNC_SOURCES`,
      default `"nuvio"`). Trakt / SIMKL options render disabled until the
      integration lands. The store doesn't branch on these yet.
- [ ] Trakt: OAuth (device or redirect) → token in an httpOnly cookie / settings
      blob → `$lib/trakt/` client for `sync/history`, `sync/watched`,
      `sync/collection`, `scrobble`. Map to the local store's shapes.
- [ ] SIMKL: same shape, SIMKL API.
- [ ] `$lib/sync/store.svelte.ts` reads/writes through whichever backend each
      domain is set to (Nuvio stays the fallback + the cross-device mirror).

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
- [x] Sort by rating; library from the local store instead of a live pull →
      `/library` sort cycles Recently added → A–Z → Top rated (`imdbRating`
      desc); the grid already reads `sync.library` once the store is
      authoritative, `data.items` only for first paint.

## Phase 6 — Playback

`$lib/watch/`: `watch.remote.ts` (`playbackContext` — meta/logo/resume/next, no
streams, both awaits `.catch`-guarded; `resolveStreams` — the slow fan-out,
client-side; `getSubtitles`, `titleProgress`, `continueWatching` — deduped to
one row per title), `stream-format.ts` (pure `describeStream` / `formatFileSize`
/ `isPlayable`, Vitest'd), `playback.ts` (`playbackHandoff` —
sessionStorage-backed stream handoff, sidebar→player), `stream-panel.svelte`
(the source sidebar).

**Flow (mirrors the Nuvio apps):** `/detail` → **"Watch" / episode opens a
right-hand source drawer** (`sources-panel.svelte.ts` module state, owned by the
`(watch)` layout — shared with `/player`, no URL param): SSR page stays put, the
list fans out client-side (`resolveStreams.current`, skeleton + "Refresh"),
filterable by addon and by quality → pick → `/player/[type]/[id]` (whole-page
surface: `(app)/+layout` drops all chrome when the path starts `/player/`;
"Sources" reopens the same drawer in place). Continue-watching tiles jump
straight to `/player/*`.

- [x] `VideoPlayer` — `hls.js` for `.m3u8`, native `<video>` (autoplay)
      otherwise; `fill` prop for the full-page player; `onSources` button;
      `object-contain`; a `loading` state (`waiting` / `canplay` / `playing`)
      shows `playback-loading.svelte` — 16:9 backdrop + softly-pulsing logo
- [x] Source drawer (`stream-panel.svelte`) — opens from `sourcesPanel` state,
      scrim + Esc to close, async list with skeleton + "Refresh", addon +
      quality filter chips, per-row addon attribution / quality / size, pick →
      handoff + `/player`
- [x] `/player/[type]/[id]` — reads the handoff (or cold-resolves + auto-picks
      the first playable), `playback-loading` while resolving, resume prompt,
      up-next autoplay, `onSources` reopens the drawer in place. A floating
      **Back** button shows whenever no stream is loaded (resolving / no-stream
      / can't-play states, where `VideoPlayer` isn't mounted) —
      `history.back()`, or `/detail` as a fallback on a cold entry.
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
- [x] "Mark watched" — `sync.markWatched` (synthetic 100% progress row using the
      parsed `runtime`, `$lib/watch/runtime.ts`) + `sync.clearProgress` (new
      `progress.delete` queue kind → `watchProgress.deleteMany`). Toggle on each
      detail episode row and a movie CTA button
- [x] Subtitle offset control; audio-track selection → - **Subtitle timing** — a
      −0.5s / +0.5s nudge in the subtitle overlay (only when a track is active);
      shifts the showing track's cue times by the delta, resets to 0 on track
      change. - **Audio tracks** — HLS only (hls.js `audioTracks` /
      `audioTrack`, driven by `AUDIO_TRACKS_UPDATED` / `AUDIO_TRACK_SWITCHED`);
      shown as an "Audio" section in the settings menu when there's more than
      one. Plain mp4/mkv `<video>` has no reliable audio-track API, so it's
      hidden there.
- [~] Episode control from the player:
  - [x] **Episode drawer + season switcher** — `player-episodes-panel.svelte`
        (right drawer, scrim + Esc), season tabs, per-episode thumb / number /
        title / rating / air date / synopsis, current episode marked "Now",
        resume bars + watched ticks from `titleProgress`. `playbackContext` now
        returns the full `episodes` list. Opened by the player's list button
        (`e` key), picking one navigates without leaving `/player`.
  - [x] **Next episode button** — `VideoPlayer` `onNext` (skip-forward icon, `n`
        key), wired to `playbackContext.next`.
  - [ ] **Skip intro / skip outro** — no addon gives intro/outro timestamps
        (Stremio protocol has no chapter data; AniSkip is anime-only). Needs a
        data source before it's more than a guess. Deferred.

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
- [ ] Addon shortcut card into `/addons`$

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
- [~] Tests: **Playwright smoke suite in `e2e/`** (`bun run test:e2e`, reuses
  the running `bun run dev` on :5173, real API via `NUVIO_TEST_*` in `.env`) —
  every route renders + client-nav + detail library toggle, all asserting no
  runtime errors. **Vitest** (`bun run test:unit`) covers
  `src/lib/sync/reconcile.ts`. Still to add: Vitest for the addon registry.
  **Run `bun run test:e2e` after any UI change** (also in CLAUDE.md)
- [ ] Rate-limit safety: keep per-user request rate well under 100 req/s; batch
      via RPC
- [x] Small-screen gate: `small-screen-notice.svelte` in the root layout,
      `md:hidden` full-screen overlay pointing phone/tablet users at the mobile
      app
- [ ] EDIT on the above! Actually let's make the app mobile friendly but display
      a dismissable banner on the bottom to tell the users the nuvio app is
      better. Use the branding logos as well in either lib/assets or the static
      directory.
- [x] Brand the auth pages with logo, theming, dark mode by default etc.. →
      `auth/+layout.svelte`: `/logo-text.webp` wordmark + tagline, twin radial
      primary glows, and a scoped `.dark` wrapper so the sign-in / sign-up
      screens are always dark without touching the global mode-watcher state.
- [x] Add fallback images for posters and/or backgrounds if they don't exist
      (catch 404 behaviour on assets). They need to be pretty → `media-poster`
      fallback gets a film/TV glyph over a gradient + wrapped title; episode
      thumbnails (accordion + in-player drawer) and the continue-watching cards
      render a glyph/gradient behind the `<img>` so a missing or 404'd image
      degrades cleanly. `onerror` flips to the fallback.

---

## CI/CD

- [ ] Create a Strict TS Lint, check & formatting pipeline w/ md formatting &
      tailwint. Add test jobs for both unit, integration & e2e.
- [ ] Create a periodic nuvio API sync job that ensures consistency with the
      app, alert on sync errors / breaking changes
- [ ] Create a release mechanism (release-please from Google) which screenshots
      the app to update the readme and releases the docker image.

## Security

- [ ] Add CSRF protection for addons. An addon CANNOT have a url pointing to the
      same address. Additionally we should have a guard on remote functions to
      ensure a malicious user isn't calling them.

## Performance

- [ ] Remove any await that loads content (not user data, this is ok) on the
      server (*.server.ts) and replace with an await in Svelte code with
      Skeleton loading.

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
