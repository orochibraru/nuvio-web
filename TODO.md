# Nuvio web TODO

## Small

//

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

## Large

- [ ] Trakt backend (OAuth → `#lib/trakt/`, map to the local store).
- [ ] SIMKL backend (same shape).
- [ ] Store reads/writes per-domain backend (`librarySource` /
      `progressSource`), Nuvio as fallback + mirror.
- [ ] Download / offline media.
- [ ] Home layout editor in Settings (API plumbing done; reverse-engineer the
      `settings_json` blob shape first).
