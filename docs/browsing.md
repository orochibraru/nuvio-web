# Browsing

Everything you can browse comes from an addon. With no addons installed, the
home feed is empty and says so; see [Addons](addons).

## Home

The home page is assembled from four things, each arriving independently behind
its own skeleton:

- a **rotating hero spotlight** drawn from your catalogs,
- **continue watching**, enriched with real titles and artwork rather than the
  raw content ids the progress records hold,
- **your library**,
- **a row per catalog** your addons expose, up to eight.

None of it blocks the page. Navigation completes on the shell, and each row
fills in when its addons answer. A row whose addon fails degrades to empty
rather than taking the page down with it, and the page distinguishes "you have
no titles yet" from "we could not reach your addons" — the first offers to add
an addon, the second offers a retry.

## Discover

The full catalog browser: any catalog from any installed addon, filtered by
genre, paginated. Catalogs that advertise genre or skip support get the
corresponding controls; those that do not are simply listed.

## Search

Search fans out across every addon that serves a search catalog and merges the
results. Recent queries are remembered locally so a repeat search is one click.

## Detail pages

A title's page carries:

- synopsis, cast and crew, IMDb rating, trailer,
- the season and episode carousel for a series,
- a **where to watch** row: the official streaming, rent and buy options for
  your region, from JustWatch. This is availability metadata, and the links send
  you to the rights holder's own paid source. Set your region in **Settings →
  Playback**, or leave it on `auto` to derive it from the browser.

Cast details (photo, short biography) come from Wikipedia's public REST summary
API, fetched **from the browser** — Wikipedia sends
`Access-Control-Allow-Origin: *`, so no third-party biography text transits the
server. Those fetches share a small global request budget so a cast list of
thirty people does not open thirty connections.

## Command palette

`⌘K` / `Ctrl-K` from anywhere opens the command palette: jump to a screen or
start a search without reaching for the nav.

## Why pages feel the way they do

Everything a page needs for its URL is fetched **by the server, for that URL**,
and streamed down as it resolves. The alternative — fetching from the browser
after the page has shipped and hydrated — costs a full extra round trip that can
only start once the device is ready, and makes first paint hostage to the
slowest phone on the network. See [Architecture](architecture).
