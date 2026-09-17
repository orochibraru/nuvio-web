# Introduction

Nuvio Web is an unofficial web UI for the [Nuvio](https://nuvio.tv/) API. Nuvio
ships a mobile app and a public API but no browser client, so this is one: sign
in with the account you already use on your phone and you get the same profiles,
addons, library and watch progress in a tab, plus a player that streams in the
browser, casts to a TV, or hands the link off to a native app.

It is a single container with no database and no volume to manage. Every piece
of user state (account, profiles, addons, library, settings, progress) lives on
your Nuvio account, so the instance you run is a stateless front end you can
delete and recreate at will.

## What it is not

Nuvio Web **hosts no media**. Catalogs, metadata, streams and subtitles all come
from **addons** you install on your own account, using the Stremio addon
protocol. The app is a shell around whatever those addons return. It does not
index, endorse or verify any addon or its content, and it is not affiliated with
or endorsed by Nuvio. Install only addons you have the right to use where you
live.

## What you get

**Browse.** A home screen with a rotating hero, continue watching, your library
and one row per catalog your addons expose. A full catalog browser under
Discover, search that fans out across every addon serving a search catalog, and
detail pages with synopsis, cast, IMDb rating, trailer, a season and episode
carousel, and a "where to watch" row listing official streaming, rent and buy
options for your region.

**Watch.** A source picker that parses quality, codec, size and release details
out of each addon's stream label, with an auto-pick that honours your preferred
resolution. HLS via `hls.js` and direct playback through the video element's own
`src`, with audio-track switching on either. Addon subtitles converted from SRT
to WebVTT in the browser. Skip intro and outro via
[TheIntroDB](https://theintrodb.org). Auto-play next episode. Casting over the
standard Remote Playback API, with AirPlay hooks as the Safari fallback. Handoff
to an external player on mobile.

**Keep.** Library, continue watching and history per profile, your own
collections of titles, watch statistics, and a local-first sync store that makes
a bookmark or a progress save land instantly and reconcile in the background.
Open tabs stay in step with each other.

**Make it yours.** Profiles with avatars, light/dark/system themes with a dim or
AMOLED dark style and seven accent colours, and settings for appearance,
playback, sync, addons and integrations, all stored on your Nuvio account so
they follow you between devices.

## License

[AGPL-3.0-or-later](https://github.com/orochibraru/nuvio-web/blob/main/LICENSE).
If you run a modified version as a network service, you must offer its source to
your users.

## Where to go next

- [Install](install) puts the container up.
- [Configuration](configuration) covers the one environment variable that
  matters and the reverse-proxy cases.
- [First run](first-run) walks from the sign-in screen to a playing episode.
- [Architecture](architecture) is the contributor's entry point.
