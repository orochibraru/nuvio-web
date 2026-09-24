# TODO

## Open

- [ ] **Chapters: MP4 QuickTime chapter tracks** (`tref/chap` + a text track)
      aren't read, only Nero `chpl`, and neither is HLS. Add if real files show
      markers missing.

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
