# Desktop app

The desktop app is Nuvio Web with its own server built in: it starts that server
on the computer's loopback address, waits for it to answer, and opens it in a
native window. It needs no Nuvio Web server anywhere else. It is built with
[Electrobun](https://github.com/blackboardsh/electrobun) and uses the system's
web view (WebKit on macOS and Linux, WebView2 on Windows), so video plays with
the codecs the system has.

## Getting it

**Profile menu → Install app**, in a desktop browser, offers the web app or the
desktop app. The web app installs through the browser's own offer where it makes
one (Chromium), and says how otherwise (Safari's Add to Dock); a window already
running as the web app goes straight to the desktop app. The desktop app links
the latest stable release's installer for this computer: its OS from the
browser, its architecture where the browser says (Chromium); a Mac that doesn't
say gets the Apple Silicon build. Every other platform's installer is listed
under it. The menu doesn't offer it inside the desktop app.

## Signing in

The sign-in page offers the official Nuvio server, selected by default, or
**Custom backend** for any other Nuvio backend: type its URL, and leave the key
empty for a Nuvio self-hosted server, which publishes it. Custom backends are on
from the start (`NUVIO_ALLOW_CUSTOM_BACKENDS`, see
[Configuration](configuration)).

## Sources the window can't play

The window plays what its web engine decodes, in hardware where the engine can.
A source it can't decode at all (a codec or container the engine refuses, or one
the addon marks as not playable in a browser) opens in [mpv](https://mpv.io)
instead, in its own window, with hardware decoding on (VideoToolbox on macOS,
D3D11 on Windows, VAAPI and friends on Linux). The app's player screen says so
while mpv plays, saves the position mpv reports as it goes, and offers to reopen
mpv once it closes.

The macOS and Windows apps ship mpv 0.41.0, checked against a pinned digest at
build time. The Intel Mac build of it needs macOS 15. On Linux the app uses the
system's mpv (`apt install mpv`, `dnf install mpv`, …); without one, such
sources show the usual "can't play" screen.

### In the window (macOS, experimental)

On macOS, mpv draws inside the app's own window instead, under the page, and the
player's controls (play and pause, seeking, ±10 s, mute, fullscreen, the
keyboard shortcuts) drive it. It is libmpv from
[MPVKit](https://github.com/mpvkit/MPVKit), linked with a small native view into
one library the app loads at start; the build fetches MPVKit's archives and
checks each against its pinned checksum. Set `NUVIO_MPV_ENGINE=always` before
starting the app to play every source this way, not only those the web view
refuses.

## Downloads

Downloads go to **Nuvio Web** in the system's videos folder, fetched by the
built-in server rather than the window, so any source with a link can be saved
(mpv-only ones included) and mpv can play the files. See
[Downloads and offline](downloads).

## Updates

The app updates itself from the latest stable release on GitHub. Once the server
is up it looks for a newer build and downloads it in the background; the next
launch asks to install it, then restarts into it. "Later" asks again on the
launch after. Dev builds never update. Every update is the full app archive
(about 130 MB), not a patch.

## Logs

Every launch logs into one SQLite file in the system's temporary folder,
`$TMPDIR/nuvio-web-desktop-<uid>/logs.sqlite` on macOS (a folder of the user's
own, readable by them only), which can be queried while the app runs. Each row
has the launch it belongs to (`run`), a time, a `source` (`shell` for the app
itself, `server` for its built-in server at debug level, `page` for the window),
a level, a message and its fields as JSON. The page reports its console, failed
requests, byte-range requests, CSP refusals, video events and the codec
questions the player asks the browser. Rows older than a week are dropped.

```bash
sqlite3 "$TMPDIR/nuvio-web-desktop-$(id -u)/logs.sqlite" \
  "SELECT at, source, level, message, data FROM logs
   WHERE run = (SELECT max(run) FROM logs) ORDER BY id"
```

## Where things are kept

Sessions, the library, watch progress and history live in the app's own SQLite
database, in the user's app-data folder, and sync with Nuvio in the background
as on any instance ([Sync](sync)). The server keeps the same loopback port from
one launch to the next, so the window stays signed in. When the server fails to
start, the window shows where the logs are.

Only the app's own pages open in the window. Any other link (a provider, an
addon's page, `vlc://`) opens in the system's default browser or app.

## Building it

Electrobun is a dev dependency, and builds go through Hutch, its build tool,
which the `electrobun` command fetches on first use. Each build compiles the
server first.

```bash
bun run dev:desktop       # build and open a dev build
bun run build:desktop     # a stable release (app, DMG / installer) for this machine
```

A build targets the machine it runs on, so the **Desktop** workflow builds each
target on its own runner (macOS Apple Silicon and Intel, Linux x64 and ARM64,
Windows x64) whenever the desktop app, the dependencies or the icon change, and
keeps the installers as run artifacts for 14 days. A stable release runs the
same builds and attaches the installers and the updater's files to the release.
Release builds are unsigned until signing is configured (see Electrobun's
code-signing guide), so macOS asks before opening one.
