import {
	classifyDecodeSamples,
	decodedFrameCount,
} from "#lib/player/video-decode.js";

interface VideoDecodeDeps {
	src: () => string;
	video: () => HTMLVideoElement | null;
	/** The stream label named a video codec the browser may not decode. */
	videoRisky: () => boolean;
	/** True while a fatal error screen is already up : stop sampling. */
	blocked: () => boolean;
}

// Seconds of advancing playback with zero decoded frames before we say
// anything. Long, because the cost of a false positive is a scary banner over a
// stream that plays fine.
const NEEDED_TICKS = 10;

/** Per-video sampler. `sample()` → true once the track looks undecodable. */
function createSampler(el: HTMLVideoElement) {
	const deltas: number[] = [];
	let lastFrames: number | null = null;
	let lastTime = 0;
	/** Set once the decoder has clearly worked : sampling is then pointless. */
	let settledOk = false;

	function sample(): boolean {
		if (settledOk) {
			return false;
		}
		// Only judge while the playback position is genuinely moving forward.
		const time = el.currentTime;
		const advancing = time > lastTime + 0.15;
		lastTime = time;
		if (!advancing || time < 3) {
			return false;
		}

		const frames = decodedFrameCount(el) ?? 0;
		if (frames > 30) {
			settledOk = true; // real frames decoded → the codec is fine
			return false;
		}
		if (lastFrames !== null) {
			deltas.push(frames - lastFrames);
			if (deltas.length > NEEDED_TICKS + 4) {
				deltas.shift();
			}
		}
		lastFrames = frames;

		return (
			el.videoWidth === 0 &&
			classifyDecodeSamples(deltas, NEEDED_TICKS) === "dead"
		);
	}

	return { sample };
}

/**
 * Watch a playing `<video>` for "audio plays, picture never appears" : a video
 * codec the browser can't decode. Only arms for a label-flagged codec. The
 * result is a **non-fatal, dismissible** signal (`issue` / `dismiss()`), like
 * the silent-audio watch.
 */
export function createVideoDecodeWatch(deps: VideoDecodeDeps) {
	let issue = $state(false);

	$effect(() => {
		void deps.src();
		issue = false;

		const el = deps.video();
		if (!(el && deps.videoRisky()) || decodedFrameCount(el) === null) {
			return; // not risky, or no frame counter → trust the browser
		}

		const sampler = createSampler(el);
		const timer = setInterval(() => {
			if (issue || deps.blocked() || el.paused) {
				return;
			}
			if (sampler.sample()) {
				issue = true;
				clearInterval(timer);
			}
		}, 1000);
		return () => clearInterval(timer);
	});

	return {
		get issue() {
			return issue;
		},
		dismiss() {
			issue = false;
		},
	};
}
