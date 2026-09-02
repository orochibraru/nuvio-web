# Nuvio web TODO

## Small

- [x] Right click on a show poster to mark as watched (all seasons) as well as a
      button on the show details page to mark all seasons as watched. _(Poster
      context menu gets a "Mark all watched" item for series — it only has the
      catalog preview, so this fetches the full meta on demand then marks every
      episode via `sync.markWatched`. The detail page's actions row gets the
      same button for series, reusing the season-carousel's existing per-
      episode marking helper across every episode. e2e covers both affordances
      render; doesn't invoke the mutation itself — unlike the movie toggle,
      marking a 60+ episode show has no one-click undo, so the test doesn't
      leave that on the shared test account.)_
- [ ] Add icons next to the options on the profile menu dropdown
- [ ] Make mobile nav a real drawer that pops out
- [ ] Make hero items scrollable horizontally via touch on mobile.
- [ ] Fix terrible looking loading animation on player (half-baked play button)
- [ ] Replace player settings icon with a playback speed icon since it's what it
      does.

## Medium

- [ ] First page load is slow especially on home and discover due to the amount
      of content. Let's load images as we scroll not before.
- [ ] Discover page navigation is fucking slow, let's fix that.
- [ ] Add audio source settings in player (multi language media)
- [ ] Add cast option to the player
- [ ] Split `nuvio/types.ts` by domain to drop the `noExcessiveLinesPerFile`
      ceiling (currently 680). _(File is 600/680 lines as of 2026-09-01 — under
      the ceiling, not currently blocking; revisit once it's back near 680.)_
- [x] Extract `media-row`'s edge-fade + arrow pair into a `scroll-rail` wrapper
      and use it for the detail-page rails (trailers, cast, seasons, episodes)
      and the discover pill rows — they currently cut mid-word with no
      affordance.
- [x] Focus-trap + restore for the player's info overlay and episode drawer (the
      sources drawer already does it) — prefer bits-ui `Dialog`. _(Both now wrap
      their markup in `DialogPrimitive.Root` + `Content` via the `child`
      snippet, so the existing Svelte transitions/classes are untouched but
      focus-trap, restore-on-close and Escape are bits-ui's, not hand-rolled.
      Fixed `e2e/watch.spec.ts`'s speed-menu assertion for the earlier
      dropdown-menu conversion, which portals to `<body>` — a page-level locator
      now finds it instead of one scoped to the player region.)_
- [x] Player settings dropdown is hand-rolled → `ui/dropdown-menu`. _(Rate +
      audio-track pickers are now `DropdownMenu.RadioGroup`/`RadioItem`, gains
      floating-ui positioning, focus trap, outside-click/Escape close, and
      `aria-expanded` for free. The `settingsOpen` state that keeps the other
      panels mutually exclusive is preserved via a controlled
      `open`/`onOpenChange` — `panels.setSettingsOpen` closes subtitles + the
      info overlay when settings opens.)_
- [x] Adopt or delete the shipped-but-unused UI kit — `tooltip` / `skeleton` /
      `separator` / `avatar` have no importers while the app hand-rolls ~30
      badges / skeletons / separators. _(Deleted `tooltip` and `avatar` —
      genuinely unused, no in-app equivalent to fold into (`profile-avatar` is a
      bespoke square/color-fallback design, not a circular avatar). Deleted
      `skeleton` — the app already replaced it on purpose with the shimmering
      `skeleton` `@utility` in `layout.css`. Adopted `separator` for the two
      spots that are genuine section dividers (app footer, stream panel's
      watch-providers block); left the ~8 `border-t`/`border-b` structural
      chrome borders on headers/footers/table rows alone since those aren't
      separator semantics and forcing the component in would reshape their
      layout for no gain.)_
- [x] More motion on the catalog rows. _(Staggered fade+slide-up entrance
      (`in:fly`, capped/reduced-motion-aware) on `MediaRow`, `MediaGrid`, and
      the library grid — plays only for genuinely new posters, since the keyed
      `{#each}` skips it for a same-key sync re-publish. Also fixed a regression
      from the earlier scroll-rail extraction along the way: `resetKey={items}`
      on `MediaRow` was snapping scroll position back to 0 on every sync tick,
      since `items` gets a fresh array reference each publish —
      `scroll-rail.svelte` now only resets scroll on an explicit, opt-in
      `resetKey` change \[used by the episode rail's season switch\], never as a
      side effect of the general content-changed recompute.)_
- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT`.
- [x] Full `addon_catalog` browse (addons that advertise other addons).
      _(`AddonManifest.addonCatalogs` was already parsed but nothing read it.
      Added `AddonRegistry.addonCatalogs()`/`findAddonCatalog()`,
      `AddonClient.getAddonCatalog()` (defensively normalizes the addon-
      supplied `{ addons: [{ transportUrl, manifest }] }` response — drops any
      entry missing a URL or an id/name), and two remote queries
      (`addonCatalogSources`, `browseAddonCatalog`). The addons page grows a
      "Discover more addons" card, hidden unless an installed addon actually
      advertises one, opening a browse dialog whose Install button re-verifies
      the manifest via the existing `previewAddon` flow rather than trusting the
      directory's own copy. Unit-tested at the remote-query boundary, matching
      this file's existing mock pattern (5 new tests).)_
- [ ] Next-air-date for an unaired next episode (needs a schedule source).
- [ ] AniSkip for anime intro/outro.
- [x] Virtualised grids for long catalogs. _(These grids scroll the window, not
      a fixed viewport, which rules out most windowing libraries without real
      surgery. Used the native equivalent instead: a `content-auto` utility
      (`content-visibility: auto` + a `contain-intrinsic-size` guess) on every
      poster in `MediaGrid` and the library grid — off-screen cards skip
      layout/paint entirely, no new dependency, no behavior change for
      unsupported browsers.)_
- [x] Roving-tabindex arrow-key nav within catalog rows. _(Built into
      `scroll-rail.svelte` — one Tab stop per row, ←/→ moves between cards and
      scrolls the target into view, a `MutationObserver` keeps it correct across
      season/catalog switches and "load more". Applies everywhere `ScrollRail`
      is used: home/discover/library/collections rails, cast, seasons, episodes,
      trailers, catalog + genre pills.)_
- [x] Global client request budget. _(New `#lib/client-request-budget.ts` — a
      FIFO semaphore, `budgeted(fn)`, capping simultaneous "nice to have"
      background requests app-wide at 6, distinct from `AddonClient`'s
      per-fan-out `FANOUT_CONCURRENCY`. Wired into `people.ts`'s Wikipedia
      cast-bio fetches, the one real unbounded fan-out in client code — an
      18-person cast row no longer opens 18 requests at once. Unit-tested.)_
- [x] Unit coverage: `sync/store.svelte.ts` (needs a Svelte test env or a pure
      extraction of the queue/merge logic) + `account.remote.ts`. _(Took the
      extraction path: `store.svelte.ts`'s remaining untested logic —
      `libraryProgress`/`titleProgress`/`isInLibrary` and the three duplicated
      `progressKey` derivations — moved into pure functions
      (`libraryProgressMap`/`titleProgressMap`/`libraryHas` in `reconcile.ts`,
      `progressKeyFor` alongside `libraryKey`/`historyKey` in `types.ts`); the
      class methods now just delegate. All net-new coverage: `reconcile.test.ts`
      (+11), new `types.test.ts` (9), new `account.remote.test.ts` (2),
      following the existing mocked-`$app/server` pattern.)_

## Large

- [ ] Move stream resolution into the browser: client `AddonClient` + browser
      registry seed for `resolveStreams` / `getStreams` (accepts CORS
      degradation on addons with no `Access-Control-Allow-Origin`).
- [ ] Trakt backend (OAuth → `#lib/trakt/`, map to the local store).
- [ ] SIMKL backend (same shape).
- [ ] Store reads/writes per-domain backend (`librarySource` /
      `progressSource`), Nuvio as fallback + mirror.
- [ ] Download / offline media.
- [ ] Home layout editor in Settings (API plumbing done; reverse-engineer the
      `settings_json` blob shape first).
