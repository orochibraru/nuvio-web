# TODO

## Open

- [ ] **Custom backends: confirm against a real self-hosted backend.** Only
      unit-tested against fakes. Check sign-in, sign-up (with and without email
      confirmation), token refresh and the background sync against a real
      self-hosted Supabase running the Nuvio schema: the RPC names, the
      `/auth/v1/settings` probe behind **Test connection**, avatar storage URLs,
      and whether a backend behind a redirect still works (redirects are
      re-checked and re-sent with the same method and body). Also confirm a LAN
      default (`http://192.168.…`) from inside the container, and run
      `e2e/custom-backend.spec.ts` (written, not run).
- [ ] **Built-in backend: run the spec, try real clients, check the proxy.**
      `/api/nuvio` is contract-tested with the app's own `NuvioClient`
      in-process only; `e2e/built-in-backend.spec.ts` was written, not run.
      Point the official Nuvio mobile/TV apps at it if they let you set a
      Supabase URL and key, and a `supabase-js` / `supabase-kt` client (their
      auth error parsing, `Authorization: Bearer <publishable key>` as
      anonymous). Confirm another instance reaching it over HTTP behind a
      reverse proxy (the instance's own default never self-calls: it routes
      in-process), and that `ORIGIN` gives the card the public URL there. Not
      built: password reset, email confirmation, account deletion, GoTrue's
      refresh-reuse grace interval (a lost refresh answer means signing in
      again).
- [ ] **Admin tabs, SMTP and dashboard: run the specs and a real send.** The
      tabbed `/admin` (Dashboard, Backends, Notifications, Settings), the SMTP
      form and the new stats are unit-tested and type-checked only; the updated
      `e2e/admin.spec.ts`, `e2e/admin-activity.spec.ts` and the three new
      `a11y.spec.ts` admin pages were written, not run. Send a real test email
      (STARTTLS on 587 and implicit TLS on 465) from the compiled image, and
      check the dashboard on a phone and on an ultrawide screen.
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
- [ ] **Addon browse page: run its specs and try it on a phone.**
      `e2e/addons-browse.spec.ts` and the two new `a11y.spec.ts` pages were
      written but not run; they lean on the live Community directory at
      `v3-cinemeta.strem.io`. Check the filter sheet, the details page's
      background art and Install / Uninstall / Undo on a real phone.
- [ ] **Subtitle picker: try it on a real phone in fullscreen.** Now a popover
      off the control bar's CC button, like the audio menu, capped to the height
      above it. Checked in Playwright's harness only, where the inline player is
      short.
- [ ] **Embedded subtitles: confirm on real streams.** HLS renditions, a file's
      own text tracks and the in-browser fix's Matroska text subtitles are
      listed off `video.textTracks`; only the parsing is unit-tested. Check an
      HLS stream with subtitle renditions (hls.js and Safari), and an MKV with
      SRT and ASS tracks through the fix (cues fill in as playback moves, the
      timing nudge follows). zlib-compressed tracks inflate with
      `DecompressionStream`; a SimpleBlock cue without a duration gets 4s.
- [ ] **Calendar: TVmaze's rate limit.** The calendar asks TVmaze about every
      library series whose addon lists no unaired episode, two calls each, four
      series at a time. TVmaze allows 20 calls per 10 seconds, so a big library
      still gets 429s and shows fewer dates on that visit. A refused call is no
      longer cached, so the next visit retries it.
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
- [ ] **Media controls and same-release next: confirm on real devices.** The
      lock screen / media keys (`navigator.mediaSession`) and the next episode
      staying on the same addon `bingeGroup` are only type-checked and
      unit-tested. Check an Android and an iOS lock screen, and a binge on a
      debrid addon that sets `bingeGroup` (Torrentio does).
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
