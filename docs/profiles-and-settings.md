# Profiles and settings

## Profiles

Profiles are your Nuvio account's profiles, with the same avatars you see on
mobile. Picking one is required before the app will show you anything: library,
progress, history, addons and settings are all per profile.

A shared link carries through the picker. Open someone's `/detail/...` link
while signed out and you land on sign-in, then the profile picker, then **that
title** — not a generic home feed.

Switching profile is a full switch: the local sync mirror is scoped per profile,
and tabs on one profile never see another profile's state.

## Settings

Settings live on your Nuvio account, so they follow you between devices. They
are split into five tabs, and the open tab is in the URL — so it survives
back/forward and can be linked to.

### Appearance

- **Mode**: light, dark or system.
- **Dark style**: `dim` or `amoled`. AMOLED is true black, for OLED panels.
- **Accent**: blue, violet, green, rose, amber, cyan or neutral.

A change previews immediately and saves in the background. If the save fails the
preview rolls back rather than lying to you about what is stored.

### Playback

- **Auto-play next** episode.
- **Preferred quality** for the player's auto-pick: `auto`, `4K`, `1080p`,
  `720p` or `480p`. `auto` means the addons' own order.
- **Subtitle size**, **colour** and **background plate**.
- **Preferred subtitle language**, auto-selected when a stream has a matching
  track. Empty means off.
- **Watch region** for the "where to watch" lookup, or `auto` to derive it from
  the browser.
- **Reuse last link** and **link cache days** — see [The player](player).

### Sync

`librarySource` and `progressSource`. Only `nuvio` works today; see
[Library and sync](library-and-sync).

### Addons

The same install / reorder / enable surface as the Addons page. See
[Addons](addons).

### Integrations

Your personal [TheIntroDB](https://theintrodb.org) API key, for skip intro and
outro. Optional: the public keyless tier works without one.

## Accessibility

Every route is checked against WCAG 2 A/AA in CI with axe, including skip links
and focus management on navigation. A violation fails the build rather than
being filed as a follow-up.
