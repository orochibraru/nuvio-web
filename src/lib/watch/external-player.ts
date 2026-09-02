/**
 * Handing a stream to whatever plays video on this device.
 *
 * There is no web API for "open in the OS default player", and a scheme can't
 * simply be glued in front of a URL : `vlc://https://host/path` parses as
 * authority `https:` and the browser drops the colon, which is why the old
 * `vlc://` button produced `vlc://https//host/path` and did nothing. Each
 * platform needs its own correctly-encoded form:
 *
 * - **Android** : an Intent URL with `action=VIEW` + `type=video/*`, which is
 *   the one case where the OS really does offer the user's video apps (or
 *   goes straight to their default).
 * - **iOS / iPadOS** : no chooser exists, and VLC's documented x-callback
 *   scheme is the realistic target.
 * - **Desktop** : nothing reliable: VLC doesn't register a URL scheme on
 *   install, so callers fall back to copying the link.
 */

export function isAndroid(userAgent: string): boolean {
	return /android/i.test(userAgent);
}

export function isIos(userAgent: string): boolean {
	// iPadOS 13+ reports itself as a Mac, distinguished by touch support; the
	// caller passes that in rather than this module poking at the DOM.
	return /iphone|ipad|ipod/i.test(userAgent);
}

/** An `intent://` URL : Android resolves it to the user's video app. */
function androidIntent(target: URL): string {
	const scheme = target.protocol.replace(":", "");
	// `#` and `;` delimit the Intent's own syntax, so only host + path +
	// query may precede the fragment.
	const rest = `${target.host}${target.pathname}${target.search}`;
	return [
		`intent://${rest}#Intent`,
		`scheme=${scheme}`,
		"action=android.intent.action.VIEW",
		"type=video/*",
		"end",
	].join(";");
}

/**
 * A deep link that hands `url` to an external player, or `null` when this
 * platform has none (desktop) or the URL isn't something a player can take
 * (a magnet link, say : `magnetLink` covers those).
 */
export function externalPlayerLink(
	url: string | null | undefined,
	userAgent: string,
): string | null {
	if (!url) {
		return null;
	}
	let target: URL;
	try {
		target = new URL(url);
	} catch {
		return null;
	}
	if (target.protocol !== "http:" && target.protocol !== "https:") {
		return null;
	}
	if (isAndroid(userAgent)) {
		return androidIntent(target);
	}
	if (isIos(userAgent)) {
		return `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(
			target.href,
		)}`;
	}
	return null;
}

/**
 * A `magnet:` URI for a P2P stream. Addons hand these back as an `infoHash`
 * (the `magnet:` url itself is dropped upstream, since it isn't an http URL),
 * and every desktop and mobile OS routes `magnet:` to whatever torrent app the
 * viewer has set as default : so this is the one handoff that works the same
 * everywhere.
 */
export function magnetLink(
	infoHash: string | null | undefined,
	displayName?: string | null,
): string | null {
	const hash = infoHash?.trim();
	if (!(hash && /^[a-f0-9]{40}$|^[a-z2-7]{32}$/i.test(hash))) {
		return null;
	}
	const magnet = `magnet:?xt=urn:btih:${hash.toLowerCase()}`;
	return displayName
		? `${magnet}&dn=${encodeURIComponent(displayName)}`
		: magnet;
}

/**
 * What the "play in an external player" button should actually do for this
 * stream on this device:
 *
 * - `link` : navigate; the OS hands it to a player (or torrent app).
 * - `copy` : no scheme is registered here (desktop + a direct URL), so the
 *   best we can do is put the URL on the clipboard for the viewer to paste.
 * - `null` : there is genuinely nothing to hand over, and the caller should
 *   not promise one.
 */
export type ExternalHandoff =
	| { kind: "link"; href: string }
	| { kind: "copy"; url: string }
	| null;

export function externalPlayerHandoff(
	stream: {
		url?: string | null;
		externalUrl?: string | null;
		infoHash?: string | null;
		name?: string | null;
	},
	userAgent: string,
): ExternalHandoff {
	const direct = stream.url ?? stream.externalUrl ?? null;
	if (direct) {
		const deepLink = externalPlayerLink(direct, userAgent);
		return deepLink
			? { kind: "link", href: deepLink }
			: { kind: "copy", url: direct };
	}
	const magnet = magnetLink(stream.infoHash, stream.name);
	return magnet ? { kind: "link", href: magnet } : null;
}
