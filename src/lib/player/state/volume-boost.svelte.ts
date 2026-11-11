import { boostSilences, needsCorsReload } from "#lib/player/boost.js";
import { rangeReader } from "#lib/player/chapters.js";
import downmixWorklet from "#lib/player/downmix-worklet.js?worker&url";

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

/** Whether `context` is running, or starts to within `ms`. */
function running(context: AudioContext, ms = 500) {
	return new Promise<boolean>((resolve) => {
		const done = () => {
			clearTimeout(timer);
			context.removeEventListener("statechange", check);
			resolve(context.state === "running");
		};
		const check = () => {
			if (context.state === "running") {
				done();
			}
		};
		const timer = setTimeout(done, ms);
		context.addEventListener("statechange", check);
		check();
	});
}

async function corsReload(
	video: HTMLVideoElement,
	src: string,
): Promise<boolean> {
	const probe = new AbortController();
	const readable = await rangeReader(src, probe.signal)(0, 1);
	if (!readable) {
		return false;
	}
	const time = video.currentTime;
	const wasPlaying = !video.paused;
	const reload = async (crossOrigin: "anonymous" | null) => {
		if (crossOrigin) {
			video.crossOrigin = crossOrigin;
		} else {
			video.removeAttribute("crossorigin");
		}
		video.src = src;
		video.load();
		const loaded = await Promise.race([
			nextEvent(video, "loadedmetadata"),
			nextEvent(video, "error").then(() => false),
		]);
		if (loaded) {
			video.currentTime = time;
			if (wasPlaying) {
				await video.play().catch(() => undefined);
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

async function build(
	video: HTMLVideoElement,
	context: AudioContext,
): Promise<BoostGraph> {
	await context.audioWorklet.addModule(downmixWorklet);
	const downmix = new AudioWorkletNode(context, "stereo-downmix", {
		channelCountMode: "max",
		channelInterpretation: "discrete",
		outputChannelCount: [2],
	});
	const gain = context.createGain();
	// A brick-wall-ish limiter : boosted peaks saturate instead of clipping.
	const limiter = context.createDynamicsCompressor();
	limiter.threshold.value = -1;
	limiter.knee.value = 0;
	limiter.ratio.value = 20;
	limiter.attack.value = 0.003;
	limiter.release.value = 0.25;
	context
		.createMediaElementSource(video)
		.connect(downmix)
		.connect(gain)
		.connect(limiter)
		.connect(context.destination);
	return { context, gain };
}

/**
 * Routes `video` through a new boost graph, or null. Called synchronously from
 * the gesture : the context is made before the first await.
 */
async function attach(
	video: HTMLVideoElement,
	src: string,
): Promise<BoostGraph | null> {
	if (boostSilences(video.currentSrc, navigator.vendor)) {
		return null;
	}
	const context = new AudioContext();
	void context.resume().catch(() => undefined);
	try {
		const clean =
			!needsCorsReload(video.currentSrc, video.crossOrigin, location.origin) ||
			(await corsReload(video, src));
		if (clean && (await running(context))) {
			return await build(video, context);
		}
	} catch {
		// Falls through : a worklet that won't load leaves playback as it was.
	}
	void context.close().catch(() => undefined);
	return null;
}

/**
 * Volume above 100% : `<video>` → stereo downmix → gain → a limiter →
 * speakers, through Web Audio. Built on the first boost, never before, so normal playback doesn't
 * touch Web Audio at all; once built it stays (an element can only be routed
 * once), and "off" is a gain of 1.
 *
 * A cross-origin direct file has to be CORS-loaded first, or Web Audio hears
 * silence. A 1-byte range probe checks the host allows it, then the element
 * reloads with `crossorigin="anonymous"` at the same position. A host that
 * refuses keeps playing untouched and `set` resolves false, as does an MSE
 * source in WebKit (see `boostSilences`).
 *
 * The element is only routed into a context that runs : WebKit keeps a
 * context made outside a user gesture suspended, and routed audio would go
 * silent. So the context is made before any await, while the gesture still
 * counts, and a restored boost (no gesture) waits for the next tap or key.
 *
 * The downmix is ours : Web Audio only folds 1, 2, 4 and 6 channels to
 * stereo, and keeps L and R of anything else (a native 7.1 track loses its
 * center, so the dialogue).
 */
export function createVolumeBoost(deps: {
	video: () => HTMLVideoElement | null;
	src: () => string;
}) {
	let level = $state(1);
	let graph: BoostGraph | null = null;
	let pending = $state(false);
	let disarm: (() => void) | null = null;

	return {
		get level() {
			return level;
		},
		get pending() {
			return pending;
		},
		/** From a user gesture. False when the host won't allow it. */
		async set(next: number): Promise<boolean> {
			const video = deps.video();
			if (!video || pending) {
				return false;
			}
			if (!graph && next !== 1) {
				pending = true;
				graph = await attach(video, deps.src()).finally(() => {
					pending = false;
				});
				if (!graph) {
					return false;
				}
			}
			if (graph) {
				graph.gain.gain.value = next;
				await graph.context.resume().catch(() => undefined);
			}
			level = next;
			return true;
		},
		/**
		 * A saved boost, outside a user gesture : applied now if the browser
		 * lets audio run, else on the next tap or key.
		 */
		async restore(next: number): Promise<void> {
			if (await this.set(next)) {
				return;
			}
			const retry = () => {
				disarm?.();
				void this.set(next);
			};
			disarm = () => {
				window.removeEventListener("pointerdown", retry, true);
				window.removeEventListener("keydown", retry, true);
				disarm = null;
			};
			window.addEventListener("pointerdown", retry, true);
			window.addEventListener("keydown", retry, true);
		},
		/** The player unmounts : let the audio context go. */
		dispose() {
			disarm?.();
			void graph?.context.close().catch(() => undefined);
			graph = null;
		},
	};
}
