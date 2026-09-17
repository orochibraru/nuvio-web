# Nuvio web TODO

## Small

- [x] ~~Add title args to every html button, especially in the player~~ Done as
      native `title` tooltips carrying the shortcut ("Pause (Space)", "Episodes
      (E)"). No tooltip component: nothing to portal, nothing to focus-trap, and
      `aria-label` still wins the accessible name so nothing is announced twice.
      That was the "more issues than it solves" worry, and it is the reason to
      stay with `title`.
- [x] ~~The settings page looks a bit shit~~ Went with the sub-navbar: on
      Settings the header's main nav row slides out and the section row slides
      in over it, sharing one grid cell so the header keeps its height and the
      search box does not shift. `#lib/settings/sections.ts` is the single list
      the header and the page both read. Below `md` the header hides its nav, so
      the page renders the same links as a scrollable pill row.

## Medium

- [x] ~~Admin page: chart sign-ins over time~~ `sign_in_events` (one row per
      sign-in, pruned to 90 days on write) plus an inline-SVG bar chart with the
      total, per-bar date / count / people tooltips and a table view. Days with
      no sign-ins are drawn as gaps, not skipped.

- [ ] Split `nuvio/types.ts` by domain to drop the `noExcessiveLinesPerFile`
      ceiling (currently 680). _(File is 600/680 lines as of 2026-09-01 : under
      the ceiling, not currently blocking; revisit once it's back near 680.)_
      **Deliberately not done in the 2026-09-17 pass**: the note above says not
      yet, and the item below settles it anyway : splitting by hand first is
      work the generator would throw away.
- [ ] Derive `nuvio/types.ts` from the generated
      `src/lib/nuvio/nuvio-public-api.json` (`bun run nuvio:spec`) instead of
      hand-writing it : would also settle the split above on its own.
- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT`. _(Needs the shape of Nuvio's collections blob first :
      same reverse-engineering as the home layout editor below.)_
- [ ] Next-air-date for an unaired next episode (needs a schedule source).
      _(Blocked: no schedule source picked. TMDB's `next_episode_to_air` or
      TVmaze would both do it; that is a decision, not a task.)_
- [ ] AniSkip for anime intro/outro. _(Not started. Needs anime detection on a
      title before the lookup is worth making : TheIntroDB already covers the
      non-anime case, so this is an addition to `player/segments.ts`, not a
      replacement.)_
- [ ] Unit-test `sync/store.svelte.ts` (queue, grace period, cursor handling).
      The owner keying and the reconcile logic are covered as pure functions
      (`syncOwner` in `sync/types.test.ts`, `reconcile.test.ts`), but the rune
      and timer orchestration around them is still e2e-only. Vitest runs in the
      node env and excludes `*.svelte.ts`; covering the store needs a second
      Vitest project with the Svelte plugin and a browser-ish env, which means
      two new dev dependencies (a DOM shim and `fake-indexeddb`). Worth it, but
      it is a dependency decision.

## Large

- [ ] Trakt backend (OAuth → `#lib/trakt/`, map to the local store). _(Blocked
      on an OAuth client id/secret and a redirect URI per instance : needs a
      decision about whether a self-hosted instance registers its own app.)_
- [ ] SIMKL backend (same shape).
- [ ] Store reads/writes per-domain backend (`librarySource` /
      `progressSource`), Nuvio as fallback + mirror. _(Depends on the two
      above.)_
- [ ] Download / offline media.
- [ ] Home layout editor in Settings (API plumbing done; reverse-engineer the
      `settings_json` blob shape first).

## Done 2026-09-17

Cross-account bleed, all one root cause: `profileId` is the profile _index_,
1..6 **within** one Nuvio account, and three caches treated it as a global
identity. On an instance with more than one account (which `/admin` exists to
support) two people who both picked profile 1 shared state.

- [x] `addons/server.ts` : registry cache keyed by account + profile, and
      `invalidateRegistry()` drops only the caller's entry so one person's addon
      edit does not re-fan-out everyone else's next page. Expired entries are
      pruned on write. Two regression tests.
- [x] `sync/` : IndexedDB rows, the `BroadcastChannel` name and recent searches
      are all namespaced by `syncOwner(userId, profileId)`. Attaching purges
      every other owner's rows; landing on an auth screen purges all of them
      (`sync/local-data.ts`), which is what makes signing out actually clear the
      device. Without this, signing in as a second account read the first one's
      library _with_ its persisted `bootstrapped`, so it skipped the full
      snapshot, pulled deltas from the wrong cursors and flushed the previous
      account's queued writes into the new account.
- [x] `QueryCacheService` deleted rather than fixed : nothing ever called
      `prime()`, so it cached nothing and its never-called `clear()` was moot.
      `docs/services.md` records what its key got wrong, for whoever wants the
      cache back.
- [x] `sync/persist.svelte.ts` extracted from `store.svelte.ts`, which the above
      pushed over the 680-line ceiling. The store decides when to persist; the
      new module knows how.

Also:

- [x] Web app manifest, `apple-touch-icon`, `theme-color` per colour scheme, and
      a 2.8 KB favicon in place of the 74 KB `logo.png`. Deleted
      `src/lib/assets/favicon.svg`, which was still the scaffold's Svelte logo.
- [x] `hooks.client.ts` no longer rolls its own `Math.random` id : both hooks
      share `#lib/core/error-id.ts`.
- [x] `CONTRIBUTING.md` rewritten to point at `docs/`. It documented
      `bun run test:integration`, which does not exist, and had three typos in
      copy-pasteable commands.
- [x] `docs/` : 19 pages plus `config.json` for orochibraru.com/nuvio-web.
