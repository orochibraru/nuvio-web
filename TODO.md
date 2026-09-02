# Nuvio web TODO

## Small

//

- [x] "Open in VLC" is broken _(`vlc://${url}` glues a scheme in front of a
      whole URL, and the URL parser then drops the inner colon —
      `vlc://https//vortex…`, exactly what you saw — so it could never have
      worked. Desktop VLC also registers no URL scheme at all. Now "Play in
      external player", resolved per platform in `#lib/watch/external-player.ts`
      (unit-tested): Android gets an Intent URL that opens the OS's own
      video-app chooser, iOS gets VLC's properly-encoded x-callback, a P2P
      source gets its `magnet:` (which every OS routes to the default torrent
      app — previously such a source offered nothing at all, since the magnet is
      stripped before it reaches the player), and desktop copies the link. The
      button is now always present when there's anything to hand over.)_
- [x] Player back arrow used `history.back()` _(Unreliable — it bounces to
      whatever was open before, or nowhere when the player was opened directly,
      and its fallback used the *video* id so an episode built a detail URL for
      a title that doesn't exist. Now always goes to that title's detail page,
      with `replaceState` so the browser's own back button doesn't come straight
      back to the player.)_

## Medium

- [ ] Split `nuvio/types.ts` by domain to drop the `noExcessiveLinesPerFile`
      ceiling (currently 680). _(File is 600/680 lines as of 2026-09-01 — under
      the ceiling, not currently blocking; revisit once it's back near 680.)_

- [ ] Collection folder reorder, tile shape / hide-title / cover image,
      `FOLLOW_LAYOUT`.
- [ ] Next-air-date for an unaired next episode (needs a schedule source).
- [ ] AniSkip for anime intro/outro.

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
