# Nuvio web — TODO

Open work only. Shipped features live in the code + `CLAUDE.md`.

## Home & discovery

- [ ] Custom per-profile backgrounds
- [ ] More motion on the catalog rows
- [ ] Home layout editor in Settings (API plumbing done; reverse-engineer the
      `settings_json` blob shape first)

## Playback

- [ ] Next-air-date for an unaired next episode (needs a schedule source)
- [ ] AniSkip for anime intro/outro
- [ ] TheIntroDB: check if an OAuth client id keeps the keyless endpoint alive
- [ ] Detect movie end, then shrink the player to the top-left with an animation
      and show "It's over but these titles could interest you" + related titles
      and a go-back button

## Library, collections & history

- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT`

## Sync & data

- [ ] Trakt backend (OAuth → `#lib/trakt/`, map to the local store)
- [ ] SIMKL backend (same shape)
- [ ] Store reads/writes per-domain backend (`librarySource` /
      `progressSource`), Nuvio as fallback + mirror
- [ ] Multi-tab: BroadcastChannel to keep store / player state coherent

## Addons

- [ ] Full `addon_catalog` browse (addons that advertise other addons)

## Polish & hardening

- [ ] Mobile: touch-target / small-screen layout polish
- [ ] Virtualised grids for long catalogs
- [ ] Roving-tabindex arrow-key nav within catalog rows
- [ ] Global client request budget
- [ ] Split `nuvio/types.ts` by domain to drop the `noExcessiveLinesPerFile`
      ceiling (currently 680)

## CI/CD

- [ ] Unit coverage: `sync/store.svelte.ts` (rune-based — needs a Svelte test
      env or pure extraction) + `account.remote.ts`
- [ ] Release: release-please + Docker image publish workflow + README
      screenshots

## Legal / compliance

- [ ] Move stream resolution into the browser: client `AddonClient` + browser
      registry seed for `resolveStreams` / `getStreams` (accepts CORS
      degradation on addons with no `Access-Control-Allow-Origin`)
- [ ] Nuvio affiliation: ask the team to review the hardcoded key + marks

## Framework

- [ ] SvelteKit 3 stable: re-check the `experimental` flags in `vite.config.ts`
      and the adapter's `config.kit` deprecation when it ships

## Standing constraints

- Playable containers: direct http(s) mp4 + HLS only; external-player handoff
  (`vlc://` / copy URL) for the rest
- Poster proxy: provider URLs only
- No server-side addon proxy; no server-side caching of addon payloads
- Subtitles: fetched + converted to WebVTT in the browser, never proxied
- Offline: meta only (read-only browse + write queue)
- Library push: incremental `upsertItems` / `deleteItems`, never `replaceLegacy`
- Trailers: YouTube embed
