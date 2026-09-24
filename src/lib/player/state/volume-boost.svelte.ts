import { needsCorsReload } from "#lib/player/boost.js";
import { rangeReader } from "#lib/player/chapters.js";

interface BoostGraph {
	context: AudioContext;
	gain: GainNode;
}

/** Resolves on the element's next `event`, or false after `ms`. */
function nextEvent(el: HTMLMediaElement, event: string, ms = 15_000) {
	return new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => resolve(false), ms);
		el.addEventListener(
			event,
			() => {
				clearTimeout(timer);
				resolve(true);
			},
			{ once: true },
		);
	});
}

/**
 * Volume above 100% : `<video>` → gain → a limiter → speakers, through Web
 * Audio. Built on the first boost, never before, so normal playback doesn't
 * touch Web Audio at all; once built it stays (an element can only be routed
 * once), and "off" is a gain of 1.
 *
 * A cross-origin direct file has to be CORS-loaded first, or Web Audio hears
 * silence. A 1-byte range probe checks the host allows it, then the element
 * reloads with `crossorigin="anonymous"` at the same position. A host that
 * refuses keeps playing untouched and `set` resolves false.
 */
export function createVolumeBoost(deps: {
	video: () => HTMLVideoElement | null;
	src: () => string;
}) {
	let level = $state(1);
	let graph: BoostGraph | null = null;
	let pending = $state(false);

	async function corsReload(el: HTMLVideoElement): Promise<boolean> {
		const probe = new AbortController();
		const readable = await rangeReader(deps.src(), probe.signal)(0, 1);
		if (!readable) {
			return false;
		}
		const time = el.currentTime;
		const wasPlaying = !el.paused;
		const reload = async (crossOrigin: "anonymous" | null) => {
			if (crossOrigin) {
				el.crossOrigin = crossOrigin;
			} else {
				el.removeAttribute("crossorigin");
			}
			el.src = deps.src();
			el.load();
			const loaded = await Promise.race([
				nextEvent(el, "loadedmetadata"),
				nextEvent(el, "error").then(() => false),
			]);
			if (loaded) {
				el.currentTime = time;
				if (wasPlaying) {
					await el.play().catch(() => undefined);
				}
			}
			return loaded;
		};
		if (await reload("anonymous")) {
			return true;
		}
		// The probe passed but the CORS load didn't : put playback back as it was.
		await reload(null);
		return false;
	}

	function build(el: HTMLVideoElement): BoostGraph {
		const context = new AudioContext();
		const gain = context.createGain();
		// A brick-wall-ish limiter : boosted peaks saturate instead of clipping.
		const limiter = context.createDynamicsCompressor();
		limiter.threshold.value = -1;
		limiter.knee.value = 0;
		limiter.ratio.value = 20;
		limiter.attack.value = 0.003;
		limiter.release.value = 0.25;
		context
			.createMediaElementSource(el)
			.connect(gain)
			.connect(limiter)
			.connect(context.destination);
		return { context, gain };
	}

	return {
		get level() {
			return level;
		},
		get pending() {
			return pending;
		},
		/** From a user gesture. False when the host won't allow it. */
		async set(next: number): Promise<boolean> {
			const el = deps.video();
			if (!el || pending) {
				return false;
			}
			if (!graph) {
				if (next === 1) {
					level = 1;
					return true;
				}
				pending = true;
				try {
					const clean =
						!needsCorsReload(el.currentSrc, el.crossOrigin, location.origin) ||
						(await corsReload(el));
					if (!clean) {
						return false;
					}
					graph = build(el);
				} finally {
					pending = false;
				}
			}
			graph.gain.gain.value = next;
			await graph.context.resume().catch(() => undefined);
			level = next;
			return true;
		},
		/** The player unmounts : let the audio context go. */
		dispose() {
			void graph?.context.close().catch(() => undefined);
			graph = null;
		},
	};
}
