# Nuvio web TODO

## Bugs

`profileId` is 1..6 **per account**, not a global identity. Three caches treat
it as one, so on an instance with more than one account (which `/admin` exists
to support) two people who both picked profile 1 share state:

- [ ] `addons/server.ts` : the module-level registry cache is keyed
      `cache.profileId === profileId` only, so account B gets account A's addon
      set, catalogs and streams for up to 60s. Fold the user id into the key (or
      hang the cache on the request scope). `invalidateRegistry()` is global for
      the same reason : one person's addon edit clears everyone's.
- [ ] `sync/idb.ts` : IndexedDB rows are keyed `<profileId>:<identity>`, and
      nothing clears them on sign-out. Sign in as another account, pick profile
      1, and `attach()` reads the previous account's library / progress /
      history **with `bootstrapped: true`**, so `sync()` skips `#bootstrap()`
      and only pulls deltas from the old cursors : the other account's rows are
      never removed, and its queued writes flush to the new account. Key the
      namespace by user id, and clear browser-local state on sign-out.
- [ ] `sync/store.svelte.ts` : `BroadcastChannel("nuvio-sync-" + profileId)` is
      same-origin, so two accounts on one browser cross-talk. Same fix.

Smaller, same family:

- [ ] `QueryCacheService.clear()` is never called : the `nuvio:query-cache`
      localStorage entry (addon catalog / meta / search results) survives
      sign-out. Call it from the sign-out path.
- [ ] `search/search-history.svelte.ts` keys on `nuvio:recent-searches` with no
      profile or account scope, so one profile's recent searches show for
      another.

## Small

- [ ] Add title args to every html button, especially in the player to know
      which icon does what. Perhaps a tooltip in the player? Something to try
      I'm afraid it might be too much and cause more issues than it solves.
- [ ] The settings page looks a bit shit, narrow design, weird second navbar
      that's not touching the first one like an extension... Either make it
      stick to the main navbar (and create child navbar on mobile), make it a
      subnavbar that slides in on top of the main one when on settings (really
      like that one) or go back to tabs.

## Medium

- [ ] Admin page: chart sign-ins over time (needs an event log, not the current
      one-row-per-person summary).

- [ ] Split `nuvio/types.ts` by domain to drop the `noExcessiveLinesPerFile`
      ceiling (currently 680). _(File is 600/680 lines as of 2026-09-01 : under
      the ceiling, not currently blocking; revisit once it's back near 680.)_
- [ ] Derive `nuvio/types.ts` from the generated
      `src/lib/nuvio/nuvio-public-api.json` (`bun run nuvio:spec`) instead of
      hand-writing it : would also settle the split above on its own.
- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT`.
- [ ] Next-air-date for an unaired next episode (needs a schedule source).
- [ ] AniSkip for anime intro/outro.
- [ ] Unit-test `sync/store.svelte.ts` (650 lines: queue, grace period, cursor
      handling). `reconcile.ts` is pure and covered, but the orchestration
      around it is e2e-only, and it is where the bugs above live. Vitest
      excludes `*.svelte.ts` wholesale : a browser-env project would let the
      store in without loosening the node-env config.
- [ ] Web app manifest + `apple-touch-icon` + `theme-color`. A watch app that
      can't be added to a home screen or launched standalone is leaving the
      obvious on the table. Also: the favicon is `logo.png` (74 KB) while the
      1.4 KB `src/lib/assets/favicon.svg` sits unused.
- [ ] `CONTRIBUTING.md` documents `bun run test:integration`, which does not
      exist in `package.json`, and has three typos in copy-pasteable commands
      (`biome check --write --unsafe .ss`, "Run the imagge", "doc
      consistencys"). Now that `docs/` exists, most of that file is better as a
      pointer to `docs/development.md` + `docs/testing.md`.
- [ ] `hooks.client.ts` rolls its own 24-char `makeid()` out of `Math.random`,
      duplicating `makeErrorId()` in `hooks.server.ts`. `crypto.randomUUID()`
      exists in every browser the app supports : one helper, both hooks.

## Large

- [ ] Trakt backend (OAuth → `#lib/trakt/`, map to the local store).
- [ ] SIMKL backend (same shape).
- [ ] Store reads/writes per-domain backend (`librarySource` /
      `progressSource`), Nuvio as fallback + mirror.
- [ ] Download / offline media.
- [ ] Home layout editor in Settings (API plumbing done; reverse-engineer the
      `settings_json` blob shape first).
