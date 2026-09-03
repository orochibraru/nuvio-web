# Nuvio web TODO

## Small

//

## Medium

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
