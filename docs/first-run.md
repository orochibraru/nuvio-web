# First run

From a fresh container to a playing episode.

## 1. Sign in

Open the instance and you land on the sign-in screen. Use the email and password
of your Nuvio account, or **Sign up** to create one; the sign-up screen talks to
the same Nuvio API the mobile app does, so an account made here works on your
phone and vice versa.

The session is stored in an `httpOnly` cookie and refreshed transparently on the
server when the upstream access token expires. Signing out clears it.

## 2. Pick a profile

Nuvio accounts have up to six profiles, each with its own library, watch
progress, history and addon set. After sign-in you get the profile picker; the
choice is remembered in a second cookie, and everything the app shows afterwards
is scoped to it.

You can switch profile from the avatar menu in the header at any time. Switching
re-scopes the sync store, so the library and continue-watching rows change with
it.

## 3. Add an addon

**An account with no addons has nothing to show.** Nuvio Web renders catalogs,
metadata and streams that addons return; without one the home screen is empty by
construction.

If your account already has addons (from the mobile app, say), they are there
already and you can skip this. Otherwise go to **Settings → Addons**, or
`/addons`, and either:

- paste an addon's manifest URL into **Add addon** and confirm the preview, or
- browse an addon catalog, if one of your installed addons serves an
  `addon_catalog` resource, and install from the list.

Addons are shared with your Nuvio account, so what you install here shows up on
mobile too. See [Addons](addons) for ordering, enabling and diagnosing them.

## 4. Find something

The home screen fills in behind skeletons: a hero spotlight, continue watching,
your library, then one row per catalog. **Discover** is the full catalog browser
with genre filters and pagination, **Search** fans out across every addon that
serves a search catalog, and `⌘K` / `Ctrl-K` opens the command palette from
anywhere.

## 5. Play it

Open a title, pick an episode if it is a series, and the source drawer lists
every stream your addons returned, annotated with quality, codec, size and
release details parsed out of the addon's own label. Pick one, or set a
preferred resolution in **Settings → Playback** and let auto-pick do it.

The player streams in the tab. From there you can switch audio track and
subtitles, skip an intro, cast to a TV, or hand the stream to an external player
on mobile. See [The player](player), which also lists the keyboard shortcuts.

## If something is wrong

The usual first-run failure is not this app: it is `ORIGIN`. If pages render but
nothing you change ever saves, read [Configuration](configuration). For anything
else, [Troubleshooting](troubleshooting).
