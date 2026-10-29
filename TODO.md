# TODO

## Open

- [ ] **Mobile shell: verify on real phones.** Bottom tab bar, search-pill
      header, grouped settings list, two-column profile picker, safe-area insets
      (`viewport-fit=cover`) and the player's auto fullscreen + landscape lock
      have only been type-checked and lint-checked, never run signed in on a
      device. iOS Safari has no element fullscreen or orientation lock, so the
      player part is Android-only there. The player's touch gestures (double-tap
      seek, hold for 2x, swipe volume / brightness) are unit-tested only. iOS
      ignores `video.volume`, so the volume swipe moves the bar there and
      nothing else; brightness is a CSS filter on the video, not the screen
      backlight.
- [ ] **External player setting: confirm the apps open on real devices.** The
      VLC / Infuse / Outplayer / VidHub / IINA links copy stremio-core's schemes
      and are only checked as `href`s. Outplayer's form drops `http` vs `https`.
      An iPad in desktop mode reports as a Mac, so it only gets the Mac apps
      (Infuse, VidHub).
- [ ] **Browser meta cache: confirm on Discover.** `hooks.server.ts` marks a
      title page's and Discover's navigation data, plus the addon-meta remote
      queries, `private, max-age=900`. Seen on a title page's `__data.json`
      only; Discover goes through the same route check but wasn't observed.
- [ ] **Subtitle picker: try it on a real phone in fullscreen.** Now a popover
      off the control bar's CC button, like the audio menu, capped to the height
      above it. Checked in Playwright's harness only, where the inline player is
      short.
- [ ] **Mobile tab bar: a Calendar tab.** The mockup has one; there is no
      calendar route yet, so the fourth tab is Collections for now.
- [ ] **In-browser fix: confirm on real debrid hosts.** Proven on local fixtures
      only (H.264 + E-AC-3, HEVC Main10 + DTS, VP9 + AC-3), in Chrome and
      Playwright's Chromium. Unknown: which hosts send CORS headers, how a 60 GB
      remux behaves (MKV cue lookup over the network, `SourceBuffer` quota at 80
      Mbit/s), and Firefox / Safari, where the refused-container path matters
      most. The e2e account has no stream addon, so this needs a real profile.
- [ ] **Audio language: "original" only works off the file's flag.** It picks
      the track a Matroska file flags original, and only when the file goes
      through the in-browser fix (no native `audioTracks`: Chrome, Firefox).
      Safari's native tracks, HLS renditions and unflagged files still fall back
      to the secondary language, then the file's default : the title's original
      language would need TMDB.
- [ ] **MP4 chapter tracks: confirm on files ffmpeg didn't write.** Apple,
      HandBrake and MP4Box output are untested. `stz2` and the chapter track's
      edit list (leading empty edits, first edit's start) are read. A fragmented
      file is covered by its `chpl` (ffmpeg writes one); a chapter track whose
      samples live only in `moof`s is not read, on purpose: it would mean
      walking every fragment of the file.

- [ ] **Bebop stills: confirm in the real profile.** `getMeta` now skips a meta
      whose IMDb / TMDB / Kitsu id contradicts the requested one, which fixes
      the case where an addon ranked above Cinemeta answers `tt0213338` with the
      remake. If the stills are still wrong, the detail URL itself carries the
      remake's id.
- [ ] **Review the fr / es / de copy.** 650+ strings, written by a model:
      idiomatic, but nobody who speaks those languages has read them yet.
- [ ] **Report Bun's embedded-file `Range` bug, then drop the shim.** Bun's own,
      not adapter-bun's: in a `bun build --compile` binary,
      `new Response(Bun.file(embedded))` answers `Range` with the whole file and
      a 200 (a file on disk gets its 206). Still there in Bun 1.4.3.
      `e2e/fixtures.ts` serves the fixtures with `Range` meanwhile.
- [ ] **Volume boost loses the center of a native 7.1 track.** Web Audio
      downmixes only 1, 2, 4 and 6 channels; the limiter's 2-channel input takes
      L and R of anything else. The in-browser fix downmixes itself
      (`downmixToStereo`), the boost graph doesn't.
