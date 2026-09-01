import { classifyDecodeSamples, decodedFrameCount } from "./video-decode.ts";

interface VideoDecodeDeps {
	src: () => string;
	video: () => HTMLVideoElement | null;
	/** The stream label named a video codec the browser may not decode. */
	videoRisky: () => boolean;
	/** True while a fatal error screen is already up — stop sampling. */
	blocked: () => boolean;
	/** Called once when the video track is judged undecodable. */
	onDead: () => void;
}

/** Rolling frame-delta sampler for one `<video>` element. */
function createSampler(el: HTMLVideoElement, needed: number) {
	const deltas: number[] = [];
	let lastFrames: number | null = null;
	let lastTime = 0;

	return {
		/** Record one tick; returns `true` once the track looks undecodable. */
		sample(): boolean {
			// Only judge while playback position is genuinely moving forward — a
			// frozen position means buffering, not a decode failure.
			const time = el.currentTime;
			const advancing = time > lastTime + 0.15;
			lastTime = time;
			if (!advancing || time < 2) {
				return false;
			}

			const frames = decodedFrameCount(el) ?? 0;
			if (lastFrames !== null) {
				deltas.push(frames - lastFrames);
				if (deltas.length > 20) {
					deltas.shift();
				}
			}
			lastFrames = frames;
			return classifyDecodeSamples(deltas, needed) === "dead";
		},
	};
}

/**
 * Watch a playing `<video>` for "audio plays, picture doesn't" — a video codec
 * the browser can't decode that slipped past the pre-flight probe and didn't
 * raise a media `error`. Re-arms whenever `src()` changes.
 */
export function createVideoDecodeWatch(deps: VideoDecodeDeps): void {
	$effect(() => {
		void deps.src();

		const el = deps.video();
		if (!el || decodedFrameCount(el) === null) {
			return; // no frame counter → nothing to go on
		}

		// A label-flagged codec earns a shorter fuse; otherwise wait out a longer
		// run so a slow first keyframe / hiccup never trips it.
		const sampler = createSampler(el, deps.videoRisky() ? 4 : 7);
		let fired = false;

		const timer = setInterval(() => {
			if (fired || deps.blocked() || el.paused) {
				return;
			}
			if (sampler.sample()) {
				fired = true;
				clearInterval(timer);
				deps.onDead();
			}
		}, 1000);
		return () => clearInterval(timer);
	});
}
