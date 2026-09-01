# Nuvio web TODO

## Quick

- [x] Home hero `<h1>` is the rotating featured title; a screen reader hears a
      changing movie name as the page heading. Add a stable `sr-only` "Home" and
      demote the hero title to `h2` on the home route.
- [x] Detail CTA silently swaps "Watch" → external "Watch on Philo" ~700ms after
      paint — keep the slot stable (skeleton until warmed) and mark the hop out.
- [x] Detail hero skeleton causes a ~500px jump when the real hero lands —
      mirror the hero's own box (`-mt-20 min-h-[72vh] pt-32 pb-12`,
      `items-end`).
- [x] Detail synopsis is `line-clamp-3` with no "More" on mobile — add a
      disclosure or a full `max-w-prose` block in the body.
- [x] `<ImdbRating>` component — the star + rating is hand-rolled in 5 places
      (`media-poster`, `media-hero`, `player-info-overlay`, `season-carousel`,
      and a literal `★` in `player-episodes-panel`).
- [x] Reduced motion: wrap the Svelte `transition:fly` / `fade` calls in the
      `reduced()` helper (`#lib/motion.ts`); drop hover image-scales to 200ms.
- [x] Profile delete: reuse the `account/+page.svelte` confirm dialog (currently
      just an inline warning line).
- [x] Undo toast for the history row-delete (library's is done).
- [x] Library sort is a blind cycle button → `DropdownMenu.RadioGroup`.
- [x] History / Discover empty states have no action button (library +
      collections do).
- [x] Discover: a stale `?c=` silently falls back to `catalogs[0]` while the URL
      still names the missing catalog; "Nothing in this catalog" has no next
      step.
- [x] Search box `autofocus` pops the keyboard on mobile load.
- [x] Provider chips lose their label alignment when they wrap (detail, 390px) —
      `grid grid-cols-[3rem_1fr]`.
- [x] Collection cards are ~456px wide holding two lines (`lg:grid-cols-3`,
      unbounded container) — add `sm` / `xl` steps.
- [x] Addon list-icons aren't size-normalised (OpenSubtitles letterboxes its
      row).

## Medium

- [ ] Split the settings page in tabs for each category. In the user dropdown
      menu remove stats and watch history to add them to tabs in the account
      page.
- [ ] TheIntroDB: check whether an OAuth client id keeps the keyless endpoint
      alive. _(Blocked — theintrodb.org and api.theintrodb.org both 403
      automated fetches; needs a human to check the dashboard/docs.)_
- [ ] Split `nuvio/types.ts` by domain to drop the `noExcessiveLinesPerFile`
      ceiling (currently 680). _(File is 600/680 lines as of 2026-09-01 — under
      the ceiling, not currently blocking; revisit once it's back near 680.)_
- [ ] Extract `media-row`'s edge-fade + arrow pair into a `scroll-rail` wrapper
      and use it for the detail-page rails (trailers, cast, seasons, episodes)
      and the discover pill rows — they currently cut mid-word with no
      affordance.
- [ ] Focus-trap + restore for the player's info overlay and episode drawer (the
      sources drawer already does it) — prefer bits-ui `Dialog`.
- [ ] Player settings dropdown is hand-rolled → `ui/dropdown-menu`.
- [ ] Adopt or delete the shipped-but-unused UI kit — `tooltip` / `skeleton` /
      `separator` / `avatar` have no importers while the app hand-rolls ~30
      badges / skeletons / separators.
- [ ] Custom per-profile backgrounds.
- [ ] More motion on the catalog rows.
- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT`.
- [ ] Full `addon_catalog` browse (addons that advertise other addons).
- [ ] Multi-tab: BroadcastChannel to keep store / player state coherent.
- [ ] Next-air-date for an unaired next episode (needs a schedule source).
- [ ] AniSkip for anime intro/outro.
- [ ] Virtualised grids for long catalogs.
- [ ] Roving-tabindex arrow-key nav within catalog rows.
- [ ] Global client request budget.
- [ ] Unit coverage: `sync/store.svelte.ts` (needs a Svelte test env or a pure
      extraction of the queue/merge logic) + `account.remote.ts`.
- [ ] Release: release-please + Docker image publish workflow + README
      screenshots.

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
