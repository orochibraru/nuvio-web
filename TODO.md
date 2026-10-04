# TODO

## Open

- [ ] **In-browser fix: confirm on real debrid hosts.** Proven on local fixtures
      only (H.264 + E-AC-3, HEVC Main10 + DTS, VP9 + AC-3), in Chrome and
      Playwright's Chromium. Unknown: which hosts send CORS headers, how a 60 GB
      remux behaves (MKV cue lookup over the network, `SourceBuffer` quota at 80
      Mbit/s), and Firefox / Safari, where the refused-container path matters
      most. The e2e account has no stream addon, so this needs a real profile.
- [ ] **Audio language: "original" isn't honoured.** The mobile app's "original
      language" choice needs the title's original language, which the player
      doesn't have; it falls back to the secondary language, then the file's
      default.
- [ ] **MP4 chapter tracks: confirm on files ffmpeg didn't write.** Apple,
      HandBrake and MP4Box output are untested; edit lists, `stz2` and
      fragmented MP4 aren't handled.

- [ ] **Bebop stills: confirm in the real profile.** `getMeta` now skips a meta
      whose IMDb / TMDB / Kitsu id contradicts the requested one, which fixes
      the case where an addon ranked above Cinemeta answers `tt0213338` with the
      remake. If the stills are still wrong, the detail URL itself carries the
      remake's id.
- [ ] **Review the fr / es / de copy.** 650+ strings, written by a model:
      idiomatic, but nobody who speaks those languages has read them yet.
- [ ] **Stale comment** in `.pre-commit-config.yaml` (~line 51) still credits
      semantic-release; it should say releaser. Edit and stage it yourself: an
      unstaged change to that file makes the prek Stop hook fail every turn.
- [ ] **Report adapter-bun's embedded `Range` bug, then drop the shim.** The
      compiled binary answers `Range` on a `static/` file with the whole file
      and a 200; the adapter's own comment assumes Bun handles it.
      `e2e/fixtures.ts` serves the fixtures with `Range` meanwhile.
