const POSITION_EVENTS = [
	"loadedmetadata",
	"durationchange",
	"ratechange",
	"seeking",
	"play",
	"pause",
] as const;

/**
 * The OS media controls (lock screen, media keys, headset buttons): what is
 * playing, with its artwork, and the play / pause / seek / next actions.
 */
export function createMediaSession(deps: {
	video: () => HTMLVideoElement | null;
	title: () => string;
	subheading: () => string | null;
	artwork: () => string | null;
	seek: (delta: number) => void;
	onNext: () => (() => void) | undefined;
}) {
	const supported = () =>
		typeof navigator !== "undefined" && "mediaSession" in navigator;

	$effect(() => {
		if (!supported()) {
			return;
		}
		const artwork = deps.artwork();
		navigator.mediaSession.metadata = new MediaMetadata({
			title: deps.title(),
			artist: deps.subheading() ?? "",
			artwork: artwork ? [{ src: artwork }] : [],
		});
		return () => {
			navigator.mediaSession.metadata = null;
		};
	});

	$effect(() => {
		const video = deps.video();
		if (!(video && supported())) {
			return;
		}
		const session = navigator.mediaSession;
		const next = deps.onNext();
		const handlers: Partial<
			Record<MediaSessionAction, MediaSessionActionHandler | null>
		> = {
			play: () => void video.play(),
			pause: () => video.pause(),
			seekbackward: (details) => deps.seek(-(details.seekOffset ?? 10)),
			seekforward: (details) => deps.seek(details.seekOffset ?? 10),
			seekto: (details) => {
				if (details.seekTime != null) {
					video.currentTime = details.seekTime;
				}
			},
			nexttrack: next ?? null,
		};
		for (const [action, handler] of Object.entries(handlers)) {
			try {
				session.setActionHandler(action as MediaSessionAction, handler);
			} catch {
				// An action this browser doesn't know.
			}
		}
		const updatePosition = () => {
			session.playbackState = video.paused ? "paused" : "playing";
			if (!(Number.isFinite(video.duration) && video.duration > 0)) {
				return;
			}
			try {
				session.setPositionState({
					duration: video.duration,
					playbackRate: video.playbackRate,
					position: Math.min(video.currentTime, video.duration),
				});
			} catch {
				// A transient state the browser rejects; the next event corrects it.
			}
		};
		for (const name of POSITION_EVENTS) {
			video.addEventListener(name, updatePosition);
		}
		return () => {
			for (const name of POSITION_EVENTS) {
				video.removeEventListener(name, updatePosition);
			}
			for (const action of Object.keys(handlers)) {
				try {
					session.setActionHandler(action as MediaSessionAction, null);
				} catch {
					// Never registered.
				}
			}
			session.playbackState = "none";
		};
	});
}
