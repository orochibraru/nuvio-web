# The player

## Picking a source

The source drawer lists every stream the addons returned for this title, with
quality, codec, size and release details parsed out of each addon's stream
label. Addons publish those as free text in whatever shape they like, so the
parser is a best effort — it will not invent a field it could not find.

**Auto-pick** honours the preferred resolution set in **Settings → Playback**.
`auto` means "take the addons' own order", which is the order you arranged your
addons in.

**Reuse last link** (Settings → Playback) re-opens a title with the stream URL
it used last time instead of resolving it again. Handy for debrid addons where
re-resolution is slow. Remembered links expire after `linkCacheDays` (3 by
default, matching most debrid providers).

## Playback

`.m3u8` plays through [`hls.js`](https://github.com/video-dev/hls.js); anything
else goes to the `<video>` element's own `src`. Audio-track switching works on
either.

Before a stream reaches `<video>`, its codec is probed. Playback that decodes no
frames (an unsupported HEVC or AV1 stream) or produces no audio (Dolby Digital,
DTS, Atmos) raises a dismissible banner naming the problem, instead of leaving
you with a black screen or silence and no explanation.

## Subtitles

Subtitles come from your addons. SRT is converted to WebVTT **in the browser**,
so a subtitle file never touches the server.

Size, colour, and a semi-opaque background plate are configurable, and a
preferred language is auto-selected when a stream carries a matching track. All
of it lives in **Settings → Playback**.

## Skip intro and outro

Intro and credits timestamps come from two community databases, neither of which
needs any server configuration:

- [TheIntroDB](https://theintrodb.org), asked first. The public keyless tier
  works out of the box. Adding your own API key in **Settings → Integrations**
  folds your pending submissions into the lookup and raises your rate limits.
  The key is stored per profile on your Nuvio account, never as a server
  environment variable.
- [AniSkip](https://aniskip.com), when TheIntroDB has nothing at all for the
  title. It is where anime skip times live, and anime is where TheIntroDB is
  thinnest. AniSkip is keyed by MyAnimeList id, so the title's IMDb, TMDB, Kitsu
  or AniList id is first mapped through [ARM](https://arm.haglund.dev). For an
  IMDb or TMDB series, ARM lists one MyAnimeList entry per season, and the
  player asks for the one matching the season you are watching. The mapping is
  also the anime detection: ARM knows nothing about a title that is not anime,
  so that lookup ends there.

A missing id mapping, a 404 (no community data yet), a rate limit or a timeout
all resolve to "no segments", and the player simply does not show the skip
affordances.

## Volume boost

The settings menu (the gauge) boosts volume to 150%, 200% or 300%, with a badge
beside the volume slider while it's on. Audio goes through Web Audio: a gain,
then a limiter, so loud peaks saturate instead of clipping. Nothing is routed
until you first pick a boost, so normal playback never touches Web Audio.

HLS streams, downloads and same-origin files can always be boosted. A direct
file from another host can only be boosted when that host sends CORS headers,
because Web Audio plays a cross-origin file loaded without CORS as silence. A
one-byte probe checks first; if it passes, the video reloads with CORS at the
same position, and if not you get a notice and playback carries on untouched.
The boost resets when the source changes.

## Chapters

The scrub bar marks chapter boundaries, and hovering it names the chapter under
the cursor.

A file's own chapters come first: Matroska / WebM `Chapters` and MP4 Nero
`chpl`. The browser reads them from the container's metadata with a few small
`Range` requests. The server never touches a stream's bytes, and the reads stop
short of the media: a Matroska walk ends at the first `Cluster`, and an MP4 walk
skips `mdat` by its size. A host that doesn't answer with CORS headers, or that
ignores `Range`, just yields no chapters. A `200` is aborted unread, so the file
is never downloaded twice. HLS streams and MP4 QuickTime chapter tracks aren't
read.

When the file has no chapters, the intro and credits timestamps above stand in
as "Intro" and "Credits".

## Auto-play next

On by default. An end-of-episode panel counts down to the next episode and lets
you stop it. Turn it off in **Settings → Playback**.

Only an episode that has aired counts as next. When the next one is listed but
not out yet, there is nothing to play, so the show ends instead and the end
panel says when that episode airs. Continue Watching follows the same rule: a
finished episode rolls forward only to one that has aired, and the card comes
back on its own once the next one does. The air date comes from the addon's
listing, or from TVmaze when the addon lists nothing past the last episode.

## Casting

No third-party SDK is involved. The player uses the standard
[Remote Playback API](https://developer.mozilla.org/docs/Web/API/Remote_Playback_API),
which reaches Chromecast on Chrome and Edge, and falls back to WebKit's AirPlay
hooks in Safari.

## Playing somewhere else

There is no web API for "open in the OS default player", and a scheme cannot
simply be glued in front of a URL. Each platform gets its own correctly encoded
form:

| Platform     | What happens                                           |
| ------------ | ------------------------------------------------------ |
| Android      | An Intent URL, so the OS offers your video apps        |
| iOS / iPadOS | VLC's documented `x-callback` scheme                   |
| Desktop      | Copy the link — VLC registers no URL scheme on install |
| P2P source   | The raw `magnet:` link                                 |

## Keyboard shortcuts

| Key                     | Action                  |
| ----------------------- | ----------------------- |
| `Space` / `K`           | Play / pause            |
| `←` / `J` and `→` / `L` | Seek 10s back / forward |
| `↑` / `↓`               | Volume                  |
| `M`                     | Mute                    |
| `F`                     | Fullscreen              |
| `C`                     | Cycle subtitle track    |
| `I`                     | Info overlay            |
| `N`                     | Next episode            |
| `E`                     | Episode list            |
| `Esc`                   | Close the open panel    |

Every control also carries its shortcut in its hover tooltip, so the icons do
not have to be learned from this table.

Shortcuts are bound on the window, but a key aimed at a focused control is left
alone: `Space` on a focused button inside the sources, subtitles or episodes
panel activates that button, as a keyboard user expects, rather than toggling
playback. `Esc` is the exception — it has to work from inside an open panel, so
it always closes it.
