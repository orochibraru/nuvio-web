# Changelog

## [1.0.16](https://github.com/orochibraru/nuvio-web/compare/v1.0.15...v1.0.16) (2026-09-25)

### Bug Fixes

* handle 429 on nuvio api ([2c21117](https://github.com/orochibraru/nuvio-web/commit/2c211173fcee2ab1cba51965d585342b34e48e55))

## [1.0.15](https://github.com/orochibraru/nuvio-web/compare/v1.0.14...v1.0.15) (2026-09-24)

### Features

* prettier ui & volume boost ([90efc84](https://github.com/orochibraru/nuvio-web/commit/90efc842444fd6dae270e60912600eba2e6c45ca))
* showcase ([0143443](https://github.com/orochibraru/nuvio-web/commit/0143443097b9efa28db98454d2ccce605259bba3))
* showcase ([25f820e](https://github.com/orochibraru/nuvio-web/commit/25f820eb1d4cb113dea7559ce0317d59381be785))

### Bug Fixes

* docs images location ([002811b](https://github.com/orochibraru/nuvio-web/commit/002811b43d03abd2b0c13cb1b02c038362fce43d))
* showcase ([693a6a2](https://github.com/orochibraru/nuvio-web/commit/693a6a2d51b51e974167484bcc6a94d7d5921892))
* prek ([555b244](https://github.com/orochibraru/nuvio-web/commit/555b244b71863a979c8890213dacd433774c8ced))
* remove gallery ([6aea28e](https://github.com/orochibraru/nuvio-web/commit/6aea28e09fdfe2660ad8b5086c12d00a5959cc39))

## [1.0.14](https://github.com/orochibraru/nuvio-web/compare/v1.0.13...v1.0.14) (2026-09-23)

### ⚠ BREAKING CHANGES

* everyone is signed out once. Sessions live in the data
directory: mount a volume on /app/data.

* perf(addons): stop waiting on slow addons, skip wrong-title metas

- getMeta returns at the first provider in registry order instead of
  waiting for every one, and skips a meta whose IMDb / TMDB / Kitsu id
  contradicts the requested title (the remake-instead-of-original case)
- Manifest fan-out goes through pooledMap
- Load failures are reason codes (timed out, HTTP status, invalid,
  blocked, unreachable) instead of raw upstream messages
- Drop the dead getStreams / homeRows / searchCatalogs remote queries

* fix(playback): consistent progress, reliable resume, working episode links

- Progress matches across URL ids, episode-derived ids and
  season/episode, so the detail page, CTA and player agree with the
  homepage; "mark unwatched" clears the player's rows too
- playOrder drops unnumbered and duplicate episodes, fixing
  "Continue S1E1" while on E2
- Resume seeds from local progress and re-seeks when the position
  arrives late; finished episodes start from the beginning; saves no
  longer wait for the meta
- The playback handoff no longer writes $state inside a $derived
- The header shows "S1E2 · name" instead of the release filename
- Episode cards are links; hls.js loads only for HLS sources; streamed()
  resets on a new path only
- Detail progress streams from the load; titleProgress and
  playbackContext are gone

* feat(sync)!: own user-data store with Nuvio mirroring and live updates

Library, watch progress and history live in this instance's SQLite per
user and profile, and are served from there. NuvioSync mirrors both ways
in the background: every 5 minutes for active users, immediately on
sign-in and app open, newer change wins, failed pushes back off. Nuvio
being down never blocks the web app.

Open tabs get every change over SSE (/api/events); the sync store
applies it in order, catches up on a gap, and relaxes its poll from
90 s to 10 min while connected.

- The sync store persists and broadcasts only what changed, with a
  batched markManyWatched
- Stats read the local store; deleting a profile's data clears it here
  after Nuvio
- docs/sync.md documents source of truth, cadence and conflicts

BREAKING CHANGE: user data lives in the data directory: mount and back
up /app/data. Browsers rebuild their local cache once.

* feat(i18n): translate the app into French, Spanish and German

paraglide-js with English as the base locale and fr / es / de
translations of every UI string, toasts, aria labels, page titles and
the server messages that reach the UI. The locale comes from a cookie,
then the language the server rendered, then the browser; a switch sits
in Settings → Appearance. Dates, numbers and language names follow the
active locale.

- Registry and download failures carry codes the UI translates, so
  cached or worker-made errors aren't stuck in one language
- A parity test fails on any missing or mismatched message

* docs: required data volume, i18n and sync conventions

README and the install guide mount /app/data. CLAUDE.md records that
this server is the source of truth for user data, that only
NUVIO_TOKENS refreshes Nuvio tokens, and that UI copy goes through
paraglide. TODO.md tracks what's left.

* chore: docs ([0afe2c4](https://github.com/orochibraru/nuvio-web/commit/0afe2c41a50a2dcf1201fa09abd58e58ef08cd7d))

### Features

* own backend with live sync, i18n, and security hardening (#14) ([0afe2c4](https://github.com/orochibraru/nuvio-web/commit/0afe2c41a50a2dcf1201fa09abd58e58ef08cd7d))

### Bug Fixes

* remove forkpreloads ([78b7b4a](https://github.com/orochibraru/nuvio-web/commit/78b7b4a16aee6b14e25d2ab96135818a652bd28f))

## [1.0.13](https://github.com/orochibraru/nuvio-web/compare/v1.0.12...v1.0.13) (2026-09-21)

### Features

* smarter precommit + pinact ([7a8b4c9](https://github.com/orochibraru/nuvio-web/commit/7a8b4c99dad1a8f57939d8b8c20ad149bef29a02))

## [1.0.12](https://github.com/orochibraru/nuvio-web/compare/v1.0.11...v1.0.12) (2026-09-18)

### Features

* offline page ([3076344](https://github.com/orochibraru/nuvio-web/commit/30763443ad81ff11b7016711a8aa963ffcd0d7a0))

## [1.0.11](https://github.com/orochibraru/nuvio-web/compare/v1.0.10...v1.0.11) (2026-09-17)

### Features

* docs ([9c03049](https://github.com/orochibraru/nuvio-web/commit/9c03049b7a61728479a25451ff1e19ab91f62072))
* docs trigger flow ([126eedb](https://github.com/orochibraru/nuvio-web/commit/126eedbb9fcd0fd520b59a0ec6d49e218cc3ac93))

## [1.0.10](https://github.com/orochibraru/nuvio-web/compare/v1.0.9...v1.0.10) (2026-09-17)

### Bug Fixes

* claude settings ([865f2b8](https://github.com/orochibraru/nuvio-web/commit/865f2b8235203f100d45f8041b94c70d2c8e9ed3))

## [1.0.9](https://github.com/orochibraru/nuvio-web/compare/v1.0.8...v1.0.9) (2026-09-08)

### Bug Fixes

* streams drawer ([#10](https://github.com/orochibraru/nuvio-web/issues/10)) ([1acfeed](https://github.com/orochibraru/nuvio-web/commit/1acfeedb16f0ab95e8c926340d4148f9082da353))

## [1.0.8](https://github.com/orochibraru/nuvio-web/compare/v1.0.7...v1.0.8) (2026-09-03)

### Features

* admin page ([ad787be](https://github.com/orochibraru/nuvio-web/commit/ad787be9e2e3044c37f2598ab4dac7f4de1ca3ca))

## [1.0.7](https://github.com/orochibraru/nuvio-web/compare/v1.0.6...v1.0.7) (2026-09-03)

### Bug Fixes

* nuvio contract checks ([fcacd96](https://github.com/orochibraru/nuvio-web/commit/fcacd96bfa12198f25b9a5d60d26774c4b4de6de))

## [1.0.6](https://github.com/orochibraru/nuvio-web/compare/v1.0.5...v1.0.6) (2026-09-03)

### Features

- api spec automation
  ([ed8dd4b](https://github.com/orochibraru/nuvio-web/commit/ed8dd4bab07915d66285da36f4395cfb951b48bd))

### Bug Fixes

- discover page navigation
  ([7dc63eb](https://github.com/orochibraru/nuvio-web/commit/7dc63eb1e35b33c622bd84200b5d96526e97e7d1))

## [1.0.5](https://github.com/orochibraru/nuvio-web/compare/v1.0.4...v1.0.5) (2026-09-02)

## [1.0.4](https://github.com/orochibraru/nuvio-web/compare/v1.0.3...v1.0.4) (2026-09-02)

### Bug Fixes

- docs
  ([6ccb9eb](https://github.com/orochibraru/nuvio-web/commit/6ccb9eb12dffd914758c400bfddb9475757e7d4f))
- e2E
  ([f521f86](https://github.com/orochibraru/nuvio-web/commit/f521f86a42e6a2242cd67f079846d1520d576410))
- performance & media reconciliation
  ([c721a61](https://github.com/orochibraru/nuvio-web/commit/c721a6149ac703b099c4afdca9521ede3f044ba5))
- tests & readme
  ([562d2cb](https://github.com/orochibraru/nuvio-web/commit/562d2cbd0c1da2db9415a244b06d73db11d7a830))

## [1.0.3](https://github.com/orochibraru/nuvio-web/compare/v1.0.2...v1.0.3) (2026-09-02)

### Features

- multi-tab broadcast channel (sync)
  ([789d27c](https://github.com/orochibraru/nuvio-web/commit/789d27cae0263502604b96f46f1940749d6efa05))

### Bug Fixes

- test coverage
  ([b7ddc38](https://github.com/orochibraru/nuvio-web/commit/b7ddc381f04dc504359ac3a42ee932d0d4f010c5))

## [1.0.2](https://github.com/orochibraru/nuvio-web/compare/v1.0.1...v1.0.2) (2026-09-02)

### Bug Fixes

- ui consistencyt
  ([0f663b8](https://github.com/orochibraru/nuvio-web/commit/0f663b80dee37193de67608c2e63c18cebc06c26))

## [1.0.1](https://github.com/orochibraru/nuvio-web/compare/v1.0.0...v1.0.1) (2026-09-02)

### Features

- settings & account tabs
  ([48c5326](https://github.com/orochibraru/nuvio-web/commit/48c53263010993cfc4a2500f9c33096c164f1982))

## 1.0.0 (2026-09-02)

### Features

- playwright showcase screenshots
  ([#1](https://github.com/orochibraru/nuvio-web/issues/1))
  ([b1b9696](https://github.com/orochibraru/nuvio-web/commit/b1b969665cebf7bef567d1a60861a40016e909f1))
- add @semantic-release/github plugin, RELEASE_TOKEN for protected-branch push
  ([#4](https://github.com/orochibraru/nuvio-web/issues/4))
  ([11122df](https://github.com/orochibraru/nuvio-web/commit/11122df0acb4b0cb29426d063f663358bca60aa2))
- addons page
  ([65d2858](https://github.com/orochibraru/nuvio-web/commit/65d2858dc0d02fc126142f9ad95d81477bc6e187))
- auth & lint
  ([fd4fdea](https://github.com/orochibraru/nuvio-web/commit/fd4fdea9ce1bc01c18b94a647957601bdb421bc2))
- better media cards, smarter episode drawer, better player ui/ux
  ([373cc6e](https://github.com/orochibraru/nuvio-web/commit/373cc6ed30e093c524d49cffba73efedad38f673))
- better player, streams and docs
  ([08fa7ca](https://github.com/orochibraru/nuvio-web/commit/08fa7caf545014f1589032d6799d1e42fcebec08))
- client-side codec detection, subtitle conversion, remote-fn tests
  ([e1e4b6d](https://github.com/orochibraru/nuvio-web/commit/e1e4b6de15eacf6e04e5f98baef86912c3a39b4f))
- components
  ([ea2e86c](https://github.com/orochibraru/nuvio-web/commit/ea2e86cdc376efaec7c72c3a1bb42d3db2920e04))
- context menus, security fixes, toasts, ctas
  ([86f8273](https://github.com/orochibraru/nuvio-web/commit/86f8273ebc3f1761b30202d96a5ea2e7e0d0d252))
- detect silent media
  ([0c5be24](https://github.com/orochibraru/nuvio-web/commit/0c5be2428943773eebdc878b544bd4e1b83630c2))
- discover & homepage
  ([244257d](https://github.com/orochibraru/nuvio-web/commit/244257dda5bcab96f17fc852a723a42b14cd4d58))
- dockerfile
  ([e2b5a1f](https://github.com/orochibraru/nuvio-web/commit/e2b5a1ff033d190db217f477912d3562352ca421))
- logger & release system
  ([#2](https://github.com/orochibraru/nuvio-web/issues/2))
  ([cfeff7a](https://github.com/orochibraru/nuvio-web/commit/cfeff7aa3663549673808f808bc8ebb2ab4c0fbf))
- media info button in player
  ([b86460b](https://github.com/orochibraru/nuvio-web/commit/b86460b25c0ba2caad41e175ec433827a150a912))
- node types
  ([f6e90e6](https://github.com/orochibraru/nuvio-web/commit/f6e90e60192556c245a5063a3532350dec7631c4))
- page struct
  ([912280c](https://github.com/orochibraru/nuvio-web/commit/912280c552b7b7aed5220b72318204b5ff0fffc6))
- page title, branding & better media info
  ([eea11ff](https://github.com/orochibraru/nuvio-web/commit/eea11ffa263b97d865a73e0c0a7076fe85d6f306))
- player loading, continue watching
  ([b0909c7](https://github.com/orochibraru/nuvio-web/commit/b0909c775874287e524537f9bd1bd0fb0e0f1422))
- player scaffold
  ([0e7e9fb](https://github.com/orochibraru/nuvio-web/commit/0e7e9fbce1297d1b4f86346fa06e53ec3e7488b4))
- prettier carousel, subtitle settings, library sorting, auth branding, search
  auto-run on type (with debounce), episode navigation within player
  ([ca341c7](https://github.com/orochibraru/nuvio-web/commit/ca341c7f5063c2cd101cf9a31b95975b0ed8f8b6))
- query cache
  ([220b168](https://github.com/orochibraru/nuvio-web/commit/220b168da72cbdda113c4b7069f3ee7469abf880))
- sexier ui
  ([de12d4e](https://github.com/orochibraru/nuvio-web/commit/de12d4e9dc56cfd8a5b2991fd402bd75c8c170f6))
- skip intro/outro
  ([fe013d6](https://github.com/orochibraru/nuvio-web/commit/fe013d6ffcb1a05cfc002eb2e19ce403565baaff))
- stricter rules
  ([1be8ba7](https://github.com/orochibraru/nuvio-web/commit/1be8ba70d773f01feb7aaa92b895fc196eb4d664))
- sv base
  ([130263d](https://github.com/orochibraru/nuvio-web/commit/130263d7114742888b4117609f1f420952a4690e))
- sveltekit 3 candidate
  ([3ed7610](https://github.com/orochibraru/nuvio-web/commit/3ed761085c3ea46e7c42b56a27b11ef223fe9248))
- sync
  ([14a41a0](https://github.com/orochibraru/nuvio-web/commit/14a41a0711e0a3f4bb795bedf1c471abd0b7cfd0))
- synced ui settings
  ([11e63cf](https://github.com/orochibraru/nuvio-web/commit/11e63cf1fc63704cda13646a5c93a24bdaa79b69))
- todo & svelte smol upgrade
  ([2916fdc](https://github.com/orochibraru/nuvio-web/commit/2916fdc56a7a01bcecedff5fcbb29b9f37b7f501))
- ui enhancements, quality settings, playback error handling, stats page,
  license, disclaimer
  ([845c100](https://github.com/orochibraru/nuvio-web/commit/845c1004c2eb6cfbdafb2b3c6c758c6310845e98))

### Bug Fixes

- animations
  ([17ba0f0](https://github.com/orochibraru/nuvio-web/commit/17ba0f00975fcc418bf3a839b79c769d703640d9))
- cast, series watched, search suggestions
  ([9f2d854](https://github.com/orochibraru/nuvio-web/commit/9f2d854554b289649cb3361856a480234a9e2808))
- code quality
  ([6d068e3](https://github.com/orochibraru/nuvio-web/commit/6d068e39815cd8bf8d8f9e7f38a6c13b261a31f7))
- lint
  ([19e7281](https://github.com/orochibraru/nuvio-web/commit/19e72810c50025b5410f28746af3e45dbfe3fe8b))
- missing semantic release dep
  ([70ce0bc](https://github.com/orochibraru/nuvio-web/commit/70ce0bc58defc081d44897fe999cef59eb80efd6))
- navigation
  ([022773f](https://github.com/orochibraru/nuvio-web/commit/022773f07fb678e293e70c6d8e9b582079efd4ea))
- page loads
  ([420ce0a](https://github.com/orochibraru/nuvio-web/commit/420ce0ae5ef8506c1ce499fd95d05bdd1814f629))
- perf & some browser errors
  ([0d2870d](https://github.com/orochibraru/nuvio-web/commit/0d2870d5415f8997a62b07a5961477966d491045))
- player ui
  ([2bd2002](https://github.com/orochibraru/nuvio-web/commit/2bd200221a6ed77b678cea86cb5a3d8f12621cbe))
- poster loading
  ([a85d875](https://github.com/orochibraru/nuvio-web/commit/a85d8752ccd5ad403a0d5c4ebb0df2f4a2af8780))
- profile switcher
  ([7d81524](https://github.com/orochibraru/nuvio-web/commit/7d81524b580ffdb5c85ac87e643c503d57cdeee4))
- release conf
  ([6a398b2](https://github.com/orochibraru/nuvio-web/commit/6a398b28dd33155a70d6f1bd988b3b300a4a6d09))
- stream filtering
  ([675a1f9](https://github.com/orochibraru/nuvio-web/commit/675a1f9eecfcf2e51f3565b8fbd0437893d771f9))
- ui
  ([481b6d0](https://github.com/orochibraru/nuvio-web/commit/481b6d0f6a12edfd73898ed4a4a8058f3cd6b71b))
- video decode false positives, switch toggle, test coverage
  ([89aabb0](https://github.com/orochibraru/nuvio-web/commit/89aabb031fa8c372a254a789670e2f4d9ed2b55f))
- watch history design, subtitle appearange, library sync store, links
  ([42d3e71](https://github.com/orochibraru/nuvio-web/commit/42d3e71ab87ed49a62f030871daaa1ad123591fc))
- watch progress
  ([5f5bf4e](https://github.com/orochibraru/nuvio-web/commit/5f5bf4ed4a71a997988cb624ddafb9b1fc949840))
