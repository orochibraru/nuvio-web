# Showcase

A tour of Nuvio Web, one screen at a time. Every title below is a
[Blender open movie](https://studio.blender.org/films/), released under Creative
Commons Attribution by the Blender Foundation and streamed from Wikimedia
Commons.

## Signing in

![The sign-in screen](showcase/01-sign-in.webp)

Sign in with the Nuvio account you already use on your phone.

![The sign-up screen](showcase/02-sign-up.webp)

Or create one. It is the same account the mobile app uses.

## Browsing

![The home screen](showcase/03-home.webp)

Home opens on a hero for the first title, then one row per addon catalog. You
choose the rows and their order in settings.

![The discover page](showcase/04-discover.webp)

Discover browses one catalog at a time, filtered by type and genre.

![Search results](showcase/05-search.webp)

Search queries every catalog that supports it at once.

## A title

![A movie's detail page](showcase/06-detail.webp)

The detail page shows metadata, similar titles and your progress.

![The sources drawer](showcase/07-sources-panel.webp)

The sources drawer lists every stream your addons return, with quality, codec
and size parsed out of their labels.

## Your stuff

![The library](showcase/08-library.webp)

![Collections](showcase/09-collections.webp)

![A collection](showcase/10-collection.webp)

Library and collections are yours to curate. They sync with the mobile app.

![Watch history](showcase/11-history.webp)

![Watch stats](showcase/12-stats.webp)

History and stats come from what you actually watched.

## Settings

![Settings](showcase/13-settings.webp)

![Addons](showcase/14-addons.webp)

Addons are per profile. Install one by URL or pick from the catalog.

![The account page](showcase/15-account.webp)

## Playback

![The player](showcase/16-player.webp)

The player streams in the browser, with subtitles and intro / outro skipping, or
casts to a TV, or hands the link off to a native app.

![The player's info overlay](showcase/17-player-info.webp)

## Regenerating the screenshots

The images come from a Playwright sequence, `e2e/showcase.spec.ts`, outside the
normal e2e run:

```bash
bun run screenshots
```

It writes straight into `docs/showcase/`; review the diff and commit the ones
you want.

Nothing copyrighted and nothing torrent-backed goes on screen. The sequence
signs the e2e test account into a dedicated profile whose only addon is
`e2e/showcase-addon`, a static Stremio addon committed in this repo: seven
Blender open movies (CC BY) with posters, stills and VP9 streams hosted on
Wikimedia Commons. Every other screen shows that profile's own data, so it must
stay clean.

Set the profile up once:

1. Pick an empty profile on the test account and put its number (1 to 6) in
   `.env` as `NUVIO_SHOWCASE_PROFILE`. The sequence skips itself without it.
2. Remove every addon from it, including Cinemeta, and install
   `https://raw.githubusercontent.com/orochibraru/nuvio-web/main/e2e/showcase-addon/manifest.json`.
3. Add a few of the films to the library, group some into a collection, and
   watch a couple of minutes of two or three of them so history, stats and
   continue watching have something to show.

Never add another addon to that profile, and never put a title from outside the
fixture in its library or history.

The fixture is plain JSON: a catalog, one `meta` and one `stream` file per film,
and a `search=blender` catalog page so the search shot has results. Add a film
by adding the same three entries.
