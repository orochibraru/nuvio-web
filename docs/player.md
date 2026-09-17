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

Intro and credits timestamps come from [TheIntroDB](https://theintrodb.org). The
public keyless tier works out of the box with no server configuration.

Adding your own API key in **Settings → Integrations** folds your pending
submissions into the lookup and raises your rate limits. The key is stored per
profile on your Nuvio account, never as a server environment variable.

A missing id mapping, a 404 (no community data yet) or a rate limit all resolve
to "no segments", and the player simply does not show the skip affordances.

## Auto-play next

On by default. An end-of-episode panel counts down to the next episode and lets
you stop it. Turn it off in **Settings → Playback**.

## Casting

No third-party SDK is involved. The player uses the standard
[Remote Playback API](https://developer.mozilla.org/docs/Web/API/Remote_Playback_API),
which reaches Chromecast on Chrome and Edge, and falls back to WebKit's AirPlay
hooks in Safari.

## Playing somewhere else

There is no web API for "open in the OS default player", and a scheme cannot
simply be glued in front of a URL. Each platform gets its own correctly-encoded
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

Shortcuts are bound on the window, but a key aimed at a focused control is left
alone: `Space` on a focused button inside the sources, subtitles or episodes
panel activates that button, as a keyboard user expects, rather than toggling
playback. `Esc` is the exception — it has to work from inside an open panel, so
it always closes it.
