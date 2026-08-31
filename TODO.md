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
- [ ] Detect movie end, then shrink the player with an animation to the top left
      and display a message saying "It's over but these titles could interest
      you" and show related titles alongside a go back button.

## Library, collections & history

- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT`

## Sync & data

- [ ] Trakt backend (OAuth → `#lib/trakt/`, map to the local store)
- [ ] SIMKL backend (same shape)
- [ ] Store reads/writes per-domain backend (`librarySource` /
      `progressSource`), Nuvio as fallback + mirror

## Addons

- [ ] Full `addon_catalog` browse (addons that advertise other addons)

## Polish & hardening

- [ ] Mobile: touch-target / small-screen layout polish
- [ ] Virtualised grids for long catalogs
- [~] A11y. Done: `afterNavigate` moves focus to `#main-content`, labelled
  poster tiles + `alt=""` on their art, keyboard-reachable row scroll buttons,
  `e2e/a11y.spec.ts` (axe, WCAG A/AA, 14 pages/states + focus checks). Still
  open: roving-tabindex arrow-key nav within catalog rows.
- [ ] Global client request budget
- [ ] `nuvio/types.ts` (600) + `sync/store.svelte.ts` (651) now set the
      `noExcessiveLinesPerFile` ceiling (680). Split `types.ts` by domain to
      drop it further.
- [ ] Detect browser unplayable codecs, just like "likely silent" media. Harden
      detection on likely silent.
-

## CI/CD

- [ ] Unit coverage for the remote-fn + store layer (0% there; ~35% overall)
- [ ] Release: release-please + Docker image publish workflow + README
      screenshots

## Legal / compliance

- [ ] Move stream resolution client-side; stop server-caching catalog/meta
- [ ] SRT→WebVTT conversion in the browser; drop the `/api/subtitle` cache
- [ ] Keep playback client-side (no server media proxy)
- [ ] Nuvio affiliation: ask the team to review the hardcoded key + marks

## Framework

- [ ] SvelteKit 3 stable: re-check the `experimental` flags in `vite.config.ts`
      and the adapter's `config.kit` deprecation when it ships

## Open decisions

- [ ] Multi-tab: BroadcastChannel to keep store / player state coherent?

## Standing constraints

- Playable containers: direct http(s) mp4 + HLS only; external-player handoff
  (`vlc://` / copy URL) for the rest
- Poster proxy: provider URLs only
- No server-side addon proxy
- Offline: meta only (read-only browse + write queue)
- Library push: incremental `upsertItems` / `deleteItems`, never `replaceLegacy`
- Trailers: YouTube embed
