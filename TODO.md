# TODO

## Open

- [ ] **Desktop downloads: run them for real, on every OS.** The server-side
      queue is unit-tested against a temp folder and a fake host (direct file,
      pause / resume from disk, a quit mid-download, HLS, owner isolation); none
      of it ran inside the app. Check on macOS, Windows and Linux: a download
      lands in the videos folder (`Utils.paths.videos`, `%USERPROFILE%\Videos`
      ignores a OneDrive-redirected Videos), plays in the window with seeking
      and its subtitles, an mpv-only one opens in mpv from the file
      (`nuvio-download:`, both the separate window and the in-window engine),
      **Open folder** opens it, quitting mid-download resumes on relaunch,
      **Change folder** opens the system's folder picker and the app comes back
      on the new folder (and **Use the default folder** back again), a source
      whose addon sends `proxyHeaders` downloads. `desktop-downloads.spec.ts`
      covers the server side in the image (a second container on :3017).
- [ ] **Volume boost in the desktop app: confirm the fix.** Both suspects were
      real. WebKit hands Web Audio silence from an MSE (`blob:`) source
      (measured in Playwright's WebKit: rms 0 while playing; a direct file and
      Chromium are fine), so boost now refuses an MSE source in WebKit
      (`boostSilences`), with the "unavailable" toast. The `AudioContext` is now
      made inside the gesture and the video is routed only once it runs; a
      restored boost that can't run waits for the next tap or key. Check in the
      app: a direct file boosts, an HLS / in-browser-fix source says unavailable
      and keeps its sound, and a reload with a saved boost keeps the sound until
      the first click.

- [ ] **Desktop app: other platforms, signing, releases.** Only macOS arm64 was
      run: the bundled server starts, the window loads it, and sign-in offers
      Nuvio and a custom backend. Untested: signing in from the app, Windows
      (WebView2) and Linux (WebKitGTK) builds, a click on an external link
      reaching the system browser (the blocked navigation was seen in the log
      only), playback in WKWebView / WebKitGTK. Signing (macOS app, nested mpv
      dylibs, DMG; the Windows Setup exe), notarization, release assets and the
      updater (a check every 6 h, "Restart to Update" in the app menu) are wired
      and were dry-run locally with stub `codesign` / `xcrun`, but have never
      run on a real release. Signing is commented out until there's an Apple
      Developer account: uncomment it (`docs/desktop.md` says where), add the
      secrets, then cut a release. A `.pfx` may not be obtainable for Windows
      (HSM-bound since 2023); Azure Trusted Signing would replace that step. The
      `Desktop` workflow hasn't run yet: the first run tells whether Windows and
      Linux build at all.
- [ ] **Desktop in-window mpv (macOS): try it on real sources.** libmpv draws
      under the page, under the web player's own control row: volume slider and
      boost (mpv's volume up to 300%, no limiter, so a loud track can clip),
      speed, the audio menu and the subtitle panel over mpv's `track-list`
      (addon subtitles added on demand with `sub-add`, timing as `sub-delay`,
      appearance as `sub-*`), the viewer's audio and subtitle languages applied
      once the tracks are known, skip intro, intro / credits on the scrub bar,
      credits starting up next, next episode and episodes. The commands and the
      `track-list` / `sub-add` shapes were checked against mpv 0.41 (the bundled
      libmpv's version) over IPC; `e2e/desktop-mpv.spec.ts` drives the controls
      against a faked engine. Not run in the app itself. Still missing: the info
      overlay, the saved per-title audio track and boost, ASS styling overrides,
      and any Windows / Linux equivalent. OpenGL is deprecated on macOS.
- [ ] **Desktop mpv fallback: play a real unplayable source.** Bundling (macOS
      arm64) and discovery were run; the hand-off itself wasn't: open a source
      the web view refuses and check mpv opens at the saved position, progress
      lands, and reopening works, a source needing the addon's `proxyHeaders`
      plays (sent as `--http-header-fields-append`, `change-list` in the
      engine), and the addon subtitles load (`--sub-files-append`, the preferred
      language first, ten at most; whether the engine selects one on its own is
      unknown). Not built: an Intel build for macOS 14. Untested: Windows
      named-pipe IPC.
- [ ] **Custom backends: confirm against a real self-hosted backend.** Only
      unit-tested against fakes. Check sign-in, sign-up (with and without email
      confirmation), token refresh and the background sync against a real
      self-hosted Supabase running the Nuvio schema: the RPC names, the
      `/auth/v1/settings` probe behind **Test connection**, avatar storage URLs,
      and whether a backend behind a redirect still works (redirects are
      re-checked and re-sent with the same method and body). Also confirm a LAN
      default (`http://192.168.…`) from inside the container, and run
      `e2e/custom-backend.spec.ts` passes. Also an empty key against a real
      `NuvioMedia/self-host` deployment: the key comes from its
      `/.well-known/nuvio` (unit-tested against fakes only).
- [ ] **Built-in backend: try real clients, check the proxy.** `/api/nuvio` is
      contract-tested with the app's own `NuvioClient` in-process, and
      `e2e/built-in-backend.spec.ts` passes. Point the official Nuvio mobile/TV
      apps at it if they let you set a Supabase URL and key, and a `supabase-js`
      / `supabase-kt` client (their auth error parsing,
      `Authorization: Bearer <publishable key>` as anonymous). Confirm another
      instance reaching it over HTTP behind a reverse proxy (the instance's own
      default never self-calls: it routes in-process), and that `ORIGIN` gives
      the card the public URL there. Password reset (`/recover`, `/verify`,
      `PUT /user`), optional email confirmation, account deletion
      (`DELETE /user`) and the 10 s refresh-reuse grace are unit-tested only:
      send a real reset and confirmation email through SMTP and follow the
      links, check that a supabase-js `verifyOtp({ type, token_hash })` and
      `updateUser({ password })` work against it. `e2e/built-in-backend.spec.ts`
      covers deletion and the Forgot password page.
- [ ] **Admin SMTP and dashboard: a real send, a phone, an ultrawide.**
      `e2e/admin.spec.ts`, `e2e/admin-activity.spec.ts` and the admin pages of
      `a11y.spec.ts` pass. Send a real test email (STARTTLS on 587 and implicit
      TLS on 465) from the compiled image, and check the dashboard on a phone
      and on an ultrawide screen.
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
- [ ] **Install app dialog: try it in Safari on a real Mac.**
      `e2e/install-app.spec.ts` passes. Safari sends no architecture hint, so it
      gets the Apple Silicon build.
- [ ] **Browser meta cache: confirm on Discover.** `hooks.server.ts` marks a
      title page's and Discover's navigation data, plus the addon-meta remote
      queries, `private, max-age=900`. Seen on a title page's `__data.json`
      only; Discover goes through the same route check but wasn't observed.
- [ ] **Addon browse page: try it on a phone.** `e2e/addons-browse.spec.ts` and
      its `a11y.spec.ts` pages pass (against the live Community directory at
      `v3-cinemeta.strem.io`). Check the filter sheet, the details page's
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
      a 200 (a file on disk gets its 206). Still there in Bun 1.4.4; the issue
      text, with a ten-line repro, is drafted and waiting to be posted.
      `e2e/fixtures.ts` serves the fixtures with `Range` meanwhile.
