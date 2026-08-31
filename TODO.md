# Nuvio web — build plan

The browser build of Nuvio: a full streaming client. Stremio-compatible addon
layer for content (catalog / meta / stream / subtitles) + an in-browser player,
with profiles, library, collections, watch progress and history synced through
the Nuvio public API (`$lib/nuvio`, client methods in
`src/lib/nuvio/client.ts`).

Target: **desktop web only** (mouse + keyboard, large screen). Mobile and TV are
covered by the existing Nuvio mobile app.

The mobile app is the reference for behaviour the API doesn't pin down: the
shapes of the settings / home-catalog / collections JSON blobs (server enforces
no schema), the progress-key format, and the 90% / 60s completion rule.

This file tracks **open work only** — shipped features live in the code. Key:
`[ ]` not started · `[~]` partially done, note says what's left.

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

---

## Home & discovery

- [~] Make the UI sexier — drifting brand aurora (`aurora-background.svelte`) on
  auth + home, richer ambient accent glow, hero accent-bloom + vignette,
  cinematic player info overlay. Still open: custom per-profile backgrounds,
  more playful motion on the catalog rows.
- [ ] Home layout editor in Settings → needs `client.homeCatalog` (opaque
      `settings_json` blob — shape defined by the mobile app, reverse-engineer
      the row order / hidden flags before building).

## Playback

- [~] Finished episode of a running show — `continueWatching` rolls forward to
  the next episode (`nextEpisode`, unit-tested). Still open: a next-air-date for
  an unaired next episode (needs a schedule source).
- [~] Skip intro / outro via TheIntroDB (`segments.remote.ts`, `mediaSegments`).
  Still open: AniSkip for anime; a still-airing-show next-air-time. Also: the
  keyless TheIntroDB endpoint may be going away — look at whether an OAuth
  client id (no secret) is enough to keep it working.
- [x] Unreachable addon → the server registry re-checks every 5s (not 60s) after
      a build with errors, and `/addons` re-polls `installedAddons` on the same
      cadence so a recovery shows without a reload.
- [x] Official "where to watch" (JustWatch, keyless,
      `watch-providers.remote.ts`) — network badge on the detail hero,
      "Available on" list on detail + source drawer + no-stream player state,
      Watch CTA falls back to the official source when no addon returns a
      stream, per-profile region setting (`watchRegion` in `uiSettings`,
      `/settings` → Playback; "auto" = `Accept-Language`). Still open: provider
      deep-linking on mobile.

## Library, collections & history

- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT` mode.

## Sync & data

- [ ] Trakt: OAuth (device or redirect) → token in an httpOnly cookie / settings
      blob → `$lib/trakt/` client for `sync/history`, `sync/watched`,
      `sync/collection`, `scrobble`. Map to the local store's shapes.
- [ ] SIMKL: same shape, SIMKL API.
- [ ] `$lib/sync/store.svelte.ts` reads/writes through whichever backend each
      domain (`librarySource` / `progressSource`) is set to; Nuvio stays the
      fallback + cross-device mirror.

## Addons

- [ ] Full `addon_catalog` resource browse (an addon that advertises _other_
      addons) — the manifest-`catalogs` list is already shown in the add
      preview.

## Polish & hardening

- [~] Mobile — small-screen banner + burger nav shipped. Still open:
  touch-target / layout polish for small screens.
- [~] Image handling — lazy-load + responsive `srcset` shipped. Still open: a
  blur-up placeholder.
- [ ] Perf — virtualised grids for long catalogs. (Route-level code splitting is
      automatic; prefetch-on-hover is on.)
- [ ] Accessibility pass — focus management, ARIA on rows / tiles / player
      (partial; reduced-motion honoured).
- [~] Rate-limit safety — addon fan-out capped at 6 concurrent (`pooledMap`),
  sync writes batch behind a 1.5s debounce. Still open: a global client request
  budget.
- [x] Navigation can't hang.
  - Every `NuvioClient.http` call is bounded by a 12s `AbortSignal.timeout` — an
    unbounded call in a load used to stall navigation forever on a Cloudflare
    1015 socket hold. `NuvioClient.withFetch(fetch)` rebinds it to a request's
    `fetch`.
  - Every `+*.server.ts` load fetches directly through a plain `*-data.ts`
    helper (`locals.nuvio.withFetch(fetch)`), never a remote `query`; no
    `Promise.all`; each pull `.catch()`es to an empty/default. `libraryItems` /
    `libraryProgress` / `getUiSettings` / `catalogList` / `getCollections` /
    `syncOverview` are no longer remote functions.
  - **`+page.server.ts` loads return the promises unawaited** — SvelteKit
    streams them, navigation completes on the shell, and each page bridges with
    `streamed()` (`$lib/stream.svelte.ts`) behind a skeleton. Only
    `+layout.server.ts` still awaits (doesn't re-run on nav; `parent()` /
    profile gate / theme seed need the resolved value).
  - The home + history loads dropped their addon `getMeta` fan-out — they ship
    raw rows and the client-side `continueWatching` / `watchHistory` queries
    enrich (poster / name / next-episode roll-forward).
  - Root `onNavigate` view-transition has a 250ms failsafe.
- [x] Every internal link goes through `resolve` from `$app/paths` (route
      existence is type-checked) — routes, components, `redirect()` targets.
      Sweep any new code the same way (CLAUDE.md).

## CI/CD

- [~] Unit-test coverage of the server / data layer — `vitest.config.ts` scopes
  coverage there + a ratcheting threshold (`test:unit:coverage`, in CI). ~27%
  lines. Still 0%: `sync.remote` / `sync/store` / `watch.remote` /
  `stats.remote` / `auth.remote` / `addons.remote` / `library.remote` /
  `history.remote` / `collections.remote` / `profiles.remote` / `hooks.server`.
  Pattern: `vi.mock("$app/server")` so `query`/`command` return the handler,
  fake `getRequestEvent().locals`.
- [ ] Release mechanism (release-please) — screenshot the app for the README,
      publish the Docker image.

## Legal / compliance

The theory: Nuvio web is a shell. Addons (Stremio protocol, user-installed) do
all content provisioning. The app hosts nothing. Items below are where the code
diverges from that.

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
- [ ] **Keep playback client-side** — `video.src` / `hls.loadSource` in the
      browser, media never transits our server. No server-side stream proxy.
- [~] **Nuvio affiliation** — app ships a hardcoded `api.nuvio.tv` key, auths
  real users against the Nuvio backend, uses the Nuvio name + logo. README says
  "unofficial". Plan: ask the Nuvio team to review; if they decline, get written
  permission or self-host the backend and drop the marks.

## Misc / Framework

- [x] Biome `preset: "all"` + `nursery: { recommended }`, with a curated config
      in `biome.json`. `lint` / `check` / `test` all clean. The re-enabled
      substantive tier (`noFloatingPromises`, `noMisusedPromises`,
      `useConsistentTypeDefinitions` → interface, `useMaxParams`,
      `noExcessiveCognitiveComplexity`, `noConsole`, `noEmptyBlockStatements`,
      `useAwait`, `noUnnecessaryConditions`, `noAwaitInLoops`) drove real
      refactors: `settleAll` / `settleSome` / `partitionSettled` in `pool.ts`
      (concurrent work + "count the results, count the errors" check — sync
      writes fan out through `Promise.allSettled` now), `reconcileDeltas` takes
      an options object, `AddonClient` requests take a `ResourceRef`,
      `playbackContext` / home `resume` / `video-player` audio-detection
      decomposed. Thresholds relaxed to fit: `noExcessiveLinesPerFile` 760,
      `noExcessiveLinesPerFunction` 80. Test/e2e/`scripts` override drops the
      test-quality rules (`noConsole`, `noEmptyBlockStatements`, `useAwait`,
      `noExcessiveLines*`, `noExcessiveCognitiveComplexity`, `noAwaitInLoops`).
      Still off: the "style churn" tier (`noMagicNumbers`, `noTernary`,
      `noDefaultExport`, `useNamingConvention`, `useConsistent*`,
      `noHexColors`…), buggy-autofix rules (`useExplicitLengthCheck`,
      `useStaticResponseMethods`, `useAtIndex`), framework-mismatch
      (`useQwikValidLexicalScope`, `useComponentExportOnlyModules`), and
      **`noUnresolvedImports`** — it can't resolve SvelteKit's Vite virtuals
      (`$app/*`, `$env/*`), generated `./$types`, `.svelte` imports or
      `@sveltejs/kit` type exports, so it was ~300 pure false positives with
      zero real hits. `noSecrets` also stays off (too noisy on this repo).
      `useSortedClasses` **is on** and already clean on this codebase.
- [ ] `video-player.svelte` still ~740 script lines (sets the
      `noExcessiveLinesPerFile` ceiling). Decompose: lift the HLS + audio-issue
      detection `$effect` into a `silent-audio.svelte.ts` rune, drop the file
      threshold back toward 550.
- [x] Upgrade to SvelteKit 3 (RC — `@sveltejs/kit@3.0.0-next.25`, `svelte@5.57`,
      `svelte-check@4.7`). Ran `bunx sv@next migrate sveltekit-3 --tasks all`,
      then finished the manual tasks by hand: - `$lib` alias → `#lib` subpath
      imports (`package.json` `imports` map). - `tsconfig.json` extends
      `$app/tsconfig`, `types` includes `$app/types`. - `$app/environment` →
      `$app/env`; `$env/dynamic/private` → `$app/env/private` via `src/env.ts`
      (`defineEnvVars`, `INTRODB_API_KEY` stays optional). - `resolve()` calls:
      pathname form lost its leading slash; the home route (no bare `/`) is
      `resolve('/(protected)/(app)')`. - `handleError` hooks: no more top-level
      `status` — discriminate on `kind` (`framework` 404s skipped); types now
      from `@sveltejs/kit/hooks`. - `goto` `keepFocus`/`noScroll` →
      `reset: false`; `replaceState` → `replace`; `page.url.searchParams` is
      readonly → build a fresh `URLSearchParams` from `page.url.search`;
      `invalidateAll()` → `refreshAll()`. -
      `beforeNavigate`/`afterNavigate`/`onNavigate` now fire on shallow nav →
      added `if (shallow) { return; }` guards. - custom adapter
      `@orochibraru/svelte-smol@1.6.0` builds fine against kit 3 (one internal
      `config.kit` deprecation warning — adapter's own code). `check` / `lint` /
      `test:unit` (154) / `build` / `test:e2e` all green. Remote functions +
      `forkPreloads` are still `experimental` in this RC, so the
      `vite.config.ts` flags stay.

## Standing constraints

- **Playable containers.** Direct http(s) mp4 + HLS only; external-player
  handoff (`vlc://` / copy URL) for the rest.
- **Poster proxy.** Provider URLs only — no server-side handling of
  copyrightable content.
- **Addon CORS.** No server-side addon proxy.
- **Offline.** Meta only — read-only browsing + the existing write queue.
- **Legacy library push.** Stay on incremental `upsertItems` / `deleteItems`;
  never `replaceLegacy`.
- **Trailer playback.** YouTube embed.

## Open decisions

- **Multi-tab.** BroadcastChannel to keep the local store / player state
  coherent across tabs?
