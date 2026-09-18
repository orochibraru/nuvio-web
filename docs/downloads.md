# Downloads and offline

Nuvio Web installs as an app and downloads titles so you can watch them without
a connection: on a plane, on a train, or anywhere the Wi-Fi gives up.

## Installing the app

In Chrome, Edge and other Chromium browsers, open the profile menu and choose
**Install app**. The item appears once the browser offers installation. The
browser's own install button in the address bar works too. In Safari, use
**Share → Add to Dock** (macOS) or **Share → Add to Home Screen** (iOS).

Installed, Nuvio Web opens in its own window, and it opens even with no network.
The app's code is cached on the device, and a navigation that can't reach the
server lands on the **offline page** instead of a browser error.

## Downloading a title

Open a title's sources (**Select stream** on its page). Every source the browser
can play has a **download** button next to it. Pick one and it joins the queue.
Each video (a movie, or one episode) gets one download.

Anything the player can play in the browser can be downloaded:

- **direct files**: MP4, WebM, MKV and similar, from an addon or a debrid
  service;
- **HLS streams** (`.m3u8`): the variant closest to your preferred quality
  (Settings → Playback), its separate audio track if it has one, and every
  segment. AES-128 encrypted streams are fine; the key is saved alongside.

What can't be downloaded, and why:

- **torrents / P2P sources**: the browser can't play them either;
- **live streams**: an HLS playlist without an end never finishes;
- **DRM-protected streams** (SAMPLE-AES, FairPlay, Widevine): the key can't be
  taken offline.

Subtitles come along too: your preferred subtitle language first, then one per
other language, up to five.

## The Downloads page

**Profile menu → Downloads** lists this profile's downloads with their progress,
and how much storage the browser allows the app. From there you can pause,
resume, delete, or play.

- **One at a time.** Downloads queue and run in order. One download already
  saturates most connections, and one finished title is worth more than three
  half-finished ones.
- **Resumable.** Closing the tab pauses a download. It picks up where it left
  off the next time the app is open: a file continues from the bytes already
  saved, and an HLS download skips the segments it already has.
- **Played from the device.** Once a download finishes, the player uses the
  saved copy for that title, even online, and whichever source you picked.

## Offline

With no network, any page opens the offline page. It lists the finished
downloads of the last profile used on this device and plays them in a simple
player, with their subtitles. Watch progress isn't recorded offline, because
there is no server to record it to.

## Where downloads live, and who sees them

Downloads are stored in the browser's private file storage for this site (the
Origin Private File System). They count against the browser's storage quota for
the site. The app asks the browser to keep them rather than evict them under
storage pressure, but the browser has the final say.

They belong to the device, not the account. They don't sync to your other
devices, and they are listed per profile. **Signing out** stops any download in
progress and hides the downloads from the offline page, but keeps the files:
they took hours to fetch, and signing back in brings them back. To free the
space, delete them from the Downloads page.

## How it works

- A **Web Worker** does the fetching and writes to disk through synchronous file
  handles, so the page stays responsive during a multi-gigabyte download.
- It tries each source directly first. If the host sends no CORS headers, or the
  source is plain `http:` under an `https:` app, it falls back to the instance's
  **download proxy** (`/api/downloads/proxy`). The proxy only serves signed-in
  users, refuses private and internal addresses, and streams bytes through
  without keeping them. See [Security](security).
- The **service worker** serves saved files at `/offline-media/<id>/…`, with
  range support so the video can seek. The player plays a download through that
  URL, the same way as any other source.
