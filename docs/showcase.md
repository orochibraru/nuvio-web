# Showcase

A tour of Nuvio Web, one screen at a time, in light and dark. Every title below
is a [Blender open movie](https://studio.blender.org/films/), released under
Creative Commons Attribution by the Blender Foundation and streamed from
Wikimedia Commons.

## Signing in

| Sign in                                    | Sign up                                    |
| ------------------------------------------ | ------------------------------------------ |
| ![The sign-in screen](images/sign-in.webp) | ![The sign-up screen](images/sign-up.webp) |

Sign in with the Nuvio account you already use on your phone, or create one. It
is the same account the mobile app uses.

## Browsing

| Light                                | Dark                                            |
| ------------------------------------ | ----------------------------------------------- |
| ![The home screen](images/home.webp) | ![The home screen, dark](images/home-dark.webp) |

Home opens on a hero carousel, then continue watching, then one row per addon
catalog. You choose the rows and their order in settings.

| Light                                      | Dark                                                  |
| ------------------------------------------ | ----------------------------------------------------- |
| ![The discover page](images/discover.webp) | ![The discover page, dark](images/discover-dark.webp) |

Discover browses one catalog at a time, filtered by type and genre.

| Light                                 | Dark                                             |
| ------------------------------------- | ------------------------------------------------ |
| ![Search results](images/search.webp) | ![Search results, dark](images/search-dark.webp) |

Search queries every catalog that supports it at once.

## A title

| Light                                        | Dark                                                    |
| -------------------------------------------- | ------------------------------------------------------- |
| ![A movie's detail page](images/detail.webp) | ![A movie's detail page, dark](images/detail-dark.webp) |

| Light                                            | Dark                                                        |
| ------------------------------------------------ | ----------------------------------------------------------- |
| ![The sources drawer](images/sources-panel.webp) | ![The sources drawer, dark](images/sources-panel-dark.webp) |

The sources drawer lists every stream your addons return, with the quality
parsed out of their labels, and where the title is available to stream legally.

## Your stuff

| Light                               | Dark                                           |
| ----------------------------------- | ---------------------------------------------- |
| ![The library](images/library.webp) | ![The library, dark](images/library-dark.webp) |

| Light                                   | Dark                                               |
| --------------------------------------- | -------------------------------------------------- |
| ![Collections](images/collections.webp) | ![Collections, dark](images/collections-dark.webp) |

| Light                                   | Dark                                               |
| --------------------------------------- | -------------------------------------------------- |
| ![A collection](images/collection.webp) | ![A collection, dark](images/collection-dark.webp) |

Library and collections are yours to curate. They sync with the mobile app.

| Light                                 | Dark                                             |
| ------------------------------------- | ------------------------------------------------ |
| ![Watch history](images/history.webp) | ![Watch history, dark](images/history-dark.webp) |

| Light                             | Dark                                         |
| --------------------------------- | -------------------------------------------- |
| ![Watch stats](images/stats.webp) | ![Watch stats, dark](images/stats-dark.webp) |

History and stats come from what you actually watched.

## Settings

| Light                             | Dark                                         |
| --------------------------------- | -------------------------------------------- |
| ![Settings](images/settings.webp) | ![Settings, dark](images/settings-dark.webp) |

| Light                         | Dark                                     |
| ----------------------------- | ---------------------------------------- |
| ![Addons](images/addons.webp) | ![Addons, dark](images/addons-dark.webp) |

Addons are per profile. Install one by URL or pick from the catalog.

| Light                                    | Dark                                                |
| ---------------------------------------- | --------------------------------------------------- |
| ![The account page](images/account.webp) | ![The account page, dark](images/account-dark.webp) |

## Playback

| Light                             | Dark                                         |
| --------------------------------- | -------------------------------------------- |
| ![The player](images/player.webp) | ![The player, dark](images/player-dark.webp) |

The player streams in the browser, with subtitles and intro / outro skipping, or
casts to a TV, or hands the link off to a native app.

## Regenerating the screenshots

```bash
bun run screenshots
```

A Playwright sequence, `e2e/showcase.spec.ts`, outside the normal e2e run. It
shoots every screen in light and dark (signed-out pages are always dark, so they
are shot once) and writes WebP straight into `docs/images/` with `Bun.Image`:
Playwright runs on Bun here (`bunfig.toml`). Each shot asserts it landed on the
right page before capturing, so a redirect or an empty screen fails the run
instead of being published. Review the diff and commit.

Nothing copyrighted and nothing torrent-backed goes on screen. Before shooting,
the run finds or creates a **Showcase** profile on the e2e test account and
seeds it through the Nuvio API: its only addon is `e2e/showcase-addon`, a static
Stremio addon committed in this repo (six Blender open movies with posters,
stills and VP9 streams on Wikimedia Commons), plus a library, watch progress,
history and a collection built from those films. The seed is idempotent, so
every run starts from the same state.

The instance loads the addon from
`https://raw.githubusercontent.com/orochibraru/nuvio-web/main/e2e/showcase-addon/`,
not from your checkout: addon requests go through the SSRF guard, which refuses
localhost. A change to the fixture shows up in the shots once it is on `main`.

The fixture is plain JSON: a catalog, one `meta` and one `stream` file per film,
and a `search=blender` catalog page so the search shot has results. Add a film
by adding the same entries.
