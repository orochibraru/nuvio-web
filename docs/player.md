# The player

## Picking a source

The source drawer lists every stream the addons returned for this title, with
quality, codec, size and release details parsed out of each addon's stream
label. Addons publish those as free text in whatever shape they like, so the
parser is a best effort — it will not invent a field it could not find.

**Auto-pick** honours the preferred resolution set in **Settings → Playback**.
`auto` means "take the addons' own order", which is the order you arranged your
addons in.

Moving on to the next episode stays on the same release: the stream from the
same addon that the addon marks as the same release (its `bingeGroup`), when the
next episode has one. Otherwise the usual auto-pick applies.

**Reuse last link** (Settings → Playback) re-opens a title with the stream URL
it used last time instead of resolving it again. Handy for debrid addons where
re-resolution is slow. Remembered links expire after `linkCacheDays` (3 by
default, matching most debrid providers).

## Playback

`.m3u8` plays through [`hls.js`](https://github.com/video-dev/hls.js); anything
else goes to the `<video>` element's own `src`. Audio-track switching works on
either.

Before a stream reaches `<video>`, its codec is probed. Playback that decodes no
frames (an unsupported HEVC or AV1 stream) raises a dismissible banner naming
the problem, instead of leaving you with a black screen and no explanation.

A direct file the browser can't play as is gets fixed **in the browser**: the
player reads the file itself, passes the video through untouched, and feeds the
result to `<video>` through Media Source Extensions. The stream never goes
through the server. Two things trigger it:

- **Audio the browser doesn't decode** (Dolby Digital, Dolby Digital Plus, DTS).
  It is decoded with WebAssembly and re-encoded to stereo, and the stream loader
  says so while it switches. The player reads the file's audio tracks as
  playback starts and switches straight away; the silence check a few seconds in
  is only a backstop. Surround is not preserved.
- **A container the browser refuses** (Matroska where `<video>` doesn't play
  it). Audio the browser decodes is copied as is.

It needs a host that allows cross-origin range reads and a browser with
`MediaSource`. When either is missing, or the audio is a format it doesn't
decode (TrueHD), you get the banner or the error screen as before.

## Audio track

A file with more than one audio track starts on your **preferred audio
language** (Settings → Playback) when it has one, and the audio button in the
control bar switches between them. Browsers that can't switch tracks in a plain
file get the in-browser fix above for that, with the audio copied untouched.

## Reloading

The player's address carries what a reload needs: the stream that is playing,
the position, the volume boost and the audio track. The stream is a short key,
not its URL: the link itself stays in this browser's storage, so a debrid URL
never lands in the address bar, the history, or a link you paste to someone.
Opened in another browser, the key means nothing and a stream is resolved as
usual.

## Subtitles

Subtitles come from your addons and from the stream itself. Addon files (SRT,
ASS / SSA, WebVTT) are converted to WebVTT **in the browser**, so a subtitle
file never touches the server. A file that isn't valid UTF-8 is read as
Windows-1252, which is what most older French and other Western European SRTs
are in. ASS styling is dropped: you get the text, with its line breaks and
timing.

The stream's own tracks are listed alongside, marked **Embedded**: HLS subtitle
renditions, the text tracks the browser exposes for a file it plays itself, and
a Matroska file's text subtitles (SRT, ASS / SSA, WebVTT) when it goes through
the in-browser fix. Those last ones are read from the bytes the fix downloads
anyway, so they fill in as playback moves forward. Image subtitles (PGS, VobSub)
are not shown.

Size, colour, a semi-opaque background plate and an outline are configurable,
and a preferred language is auto-selected when a stream carries a matching
track. All of it lives in **Settings → Playback**.

The timing nudge (in the subtitles menu, or `G` / `H`) applies to whichever
track is showing, and stays when you switch tracks or move to another source of
the same video.

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

**Skip intro and credits** (Settings → Playback, off by default) skips the intro
on its own, once per source, and goes from the credits straight to the next
episode instead of the up-next countdown. The last episode still ends on the end
panel.

## Volume boost

The speaker button beside the volume slider boosts volume to 150%, 200% or 300%,
with a badge beside the volume slider while it's on. Audio goes through Web
Audio: a gain, then a limiter, so loud peaks saturate instead of clipping.
Nothing is routed until you first pick a boost, so normal playback never touches
Web Audio.

HLS streams, downloads and same-origin files can always be boosted. A direct
file from another host can only be boosted when that host sends CORS headers,
because Web Audio plays a cross-origin file loaded without CORS as silence. A
one-byte probe checks first; if it passes, the video reloads with CORS at the
same position, and if not you get a notice and playback carries on untouched.
The boost stays on for the title you're watching, across sources and reloads,
and resets when you move to another one.

## Chapters

The scrub bar marks chapter boundaries, and hovering it names the chapter under
the cursor.

A file's own chapters come first: Matroska / WebM `Chapters` and MP4 Nero
`chpl`, else an MP4 QuickTime chapter track. The browser reads them from the
container's metadata with a few small `Range` requests. The server never touches
a stream's bytes, and the reads stop short of the media: a Matroska walk ends at
the first `Cluster`, and an MP4 walk skips `mdat` by its size, going in only for
a chapter track's titles. A host that doesn't answer with CORS headers, or that
ignores `Range`, just yields no chapters. A `200` is aborted unread, so the file
is never downloaded twice. HLS streams aren't read.

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

## System media controls

The lock screen, the media keys and a headset's buttons see what is playing,
with its poster, and can play, pause, seek and skip to the next episode.

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

| Key                     | Action                    |
| ----------------------- | ------------------------- |
| `Space` / `K`           | Play / pause              |
| `←` / `J` and `→` / `L` | Seek 10s back / forward   |
| `0` to `9`              | Jump to 0% to 90%         |
| `↑` / `↓`               | Volume                    |
| `M`                     | Mute                      |
| `<` / `>`               | Slower / faster           |
| `F`                     | Fullscreen                |
| `P`                     | Picture in picture        |
| `C`                     | Cycle subtitle track      |
| `G` / `H`               | Subtitles earlier / later |
| `I`                     | Info overlay              |
| `N`                     | Next episode              |
| `E`                     | Episode list              |
| `?`                     | List these shortcuts      |
| `Esc`                   | Close the open panel      |

Every control also carries its shortcut in its hover tooltip, so the icons do
not have to be learned from this table. Outside the player, `/` opens search.

Shortcuts are bound on the window, but a key aimed at a focused control is left
alone: `Space` on a focused button inside the sources, subtitles or episodes
panel activates that button, as a keyboard user expects, rather than toggling
playback. `Esc` is the exception — it has to work from inside an open panel, so
it always closes it.
