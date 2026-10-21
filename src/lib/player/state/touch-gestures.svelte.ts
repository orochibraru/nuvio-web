import {
	BRIGHTNESS_RANGE,
	classifyDrag,
	DOUBLE_TAP_MS,
	GESTURE_SEEK_SECONDS,
	type GestureZone,
	gestureZone,
	HOLD_RATE,
	isDoubleTap,
	LONG_PRESS_MS,
	swipeLevel,
	swipeSide,
	type TapPoint,
	VOLUME_RANGE,
} from "#lib/player/gestures.js";
import type { PlayerTransportState } from "./transport-state.svelte.ts";

export type GestureFeedback =
	| { kind: "seek"; side: "left" | "right"; seconds: number }
	| { kind: "speed" }
	| { kind: "volume"; level: number }
	| { kind: "brightness"; level: number };

type Feedback = ReturnType<typeof createFeedback>;

interface Touch {
	id: number;
	x: number;
	y: number;
	width: number;
	height: number;
	mode: "pending" | "hold" | "swipe" | "ignored";
	side: "left" | "right";
	startLevel: number;
	restoreRate: number;
	controlsVisible: boolean;
}

/** A touch that just landed on the picture, in the picture's own coordinates. */
function touchFrom(
	event: PointerEvent,
	transport: PlayerTransportState,
): Touch {
	const rect = (event.currentTarget as Element).getBoundingClientRect();
	const x = event.clientX - rect.left;
	return {
		id: event.pointerId,
		x,
		y: event.clientY - rect.top,
		width: rect.width,
		height: rect.height,
		mode: "pending",
		side: swipeSide(x, rect.width),
		startLevel: 0,
		restoreRate: transport.rate,
		controlsVisible: transport.controlsVisible,
	};
}

/** What a gesture just did, shown until `clearLater` runs out. */
function createFeedback() {
	let current = $state<GestureFeedback | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	return {
		get current() {
			return current;
		},
		show(next: GestureFeedback | null) {
			clearTimeout(timer);
			current = next;
		},
		clearLater(ms: number) {
			clearTimeout(timer);
			timer = setTimeout(() => {
				current = null;
			}, ms);
		},
		dispose: () => clearTimeout(timer),
	};
}

/**
 * Taps: a centre one runs at once; a side one waits out the double-tap window,
 * and a second tap there seeks instead, as does each further quick tap.
 */
function createTapSequence(deps: {
	seek: (delta: number) => void;
	onTap: (controlsVisible: boolean) => void;
	feedback: Feedback;
}) {
	let lastTap: (TapPoint & { zone: GestureZone }) | null = null;
	let burst: { side: "left" | "right"; until: number; seconds: number } | null =
		null;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function seek(side: "left" | "right", time: number) {
		deps.seek(side === "left" ? -GESTURE_SEEK_SECONDS : GESTURE_SEEK_SECONDS);
		const seconds =
			(burst?.side === side ? burst.seconds : 0) + GESTURE_SEEK_SECONDS;
		burst = { side, until: time + DOUBLE_TAP_MS, seconds };
		deps.feedback.show({ kind: "seek", side, seconds });
		deps.feedback.clearLater(700);
	}

	function tap(point: TapPoint, zone: GestureZone, controlsVisible: boolean) {
		clearTimeout(timer);
		if (zone === "center") {
			burst = null;
			lastTap = null;
			deps.onTap(controlsVisible);
			return;
		}
		const inBurst = burst?.side === zone && point.time <= burst.until;
		if (inBurst || (lastTap?.zone === zone && isDoubleTap(lastTap, point))) {
			lastTap = null;
			seek(zone, point.time);
			return;
		}
		burst = null;
		lastTap = { ...point, zone };
		timer = setTimeout(() => {
			lastTap = null;
			deps.onTap(controlsVisible);
		}, DOUBLE_TAP_MS);
	}

	return { tap, dispose: () => clearTimeout(timer) };
}

/** Vertical swipes: volume on the right half, brightness on the left. */
function createSwipes(transport: PlayerTransportState, feedback: Feedback) {
	let brightness = $state(1);

	/** A pending touch moved: still a tap, a swipe, or a drag left alone. */
	function begin(touch: Touch, dx: number, dy: number) {
		const vertical = classifyDrag(dx, dy);
		if (vertical === null) {
			return false;
		}
		touch.mode = vertical ? "swipe" : "ignored";
		const volume = transport.muted ? 0 : transport.volume;
		touch.startLevel = touch.side === "right" ? volume : brightness;
		return true;
	}

	function move(touch: Touch, dy: number) {
		const range = touch.side === "right" ? VOLUME_RANGE : BRIGHTNESS_RANGE;
		const level = swipeLevel(touch.startLevel, dy, touch.height, range);
		if (touch.side === "right") {
			transport.volume = level;
			transport.muted = level === 0;
			feedback.show({ kind: "volume", level });
		} else {
			brightness = level;
			feedback.show({ kind: "brightness", level });
		}
	}

	return {
		get brightness() {
			return brightness;
		},
		begin,
		move,
	};
}

/**
 * Mobile-app style touch gestures on the picture, when the viewer has them on:
 *
 * - double tap the left / right third : back / forward 10s, and each further
 *   quick tap on that side adds another 10s;
 * - press and hold : 2x speed until released;
 * - swipe up / down on the right half : volume, on the left half : brightness
 *   (a `filter: brightness()` on the video : a web page can't touch the
 *   screen's own backlight).
 *
 * A single tap still does what it did (`onTap`), delayed by the double-tap
 * window on the sides so a double tap doesn't flash the controls first.
 * `pointerdown` returns whether it took the touch; when it didn't (gestures
 * off, a mouse), the caller's own click handling applies.
 */
export function createTouchGestures(deps: {
	enabled: () => boolean;
	transport: PlayerTransportState;
	seek: (delta: number) => void;
	/** A single tap, with whether the controls were up when it began. */
	onTap: (controlsVisible: boolean) => void;
}) {
	const { transport } = deps;
	const feedback = createFeedback();
	const taps = createTapSequence({ ...deps, feedback });
	const swipes = createSwipes(transport, feedback);
	let touch: Touch | null = null;
	let holdTimer: ReturnType<typeof setTimeout> | undefined;

	function startHold() {
		if (touch?.mode !== "pending" || transport.paused) {
			return;
		}
		touch.mode = "hold";
		touch.restoreRate = transport.rate;
		transport.rate = HOLD_RATE;
		feedback.show({ kind: "speed" });
	}

	function pointerdown(event: PointerEvent): boolean {
		if (event.pointerType === "mouse" || !deps.enabled()) {
			return false;
		}
		// No compat `mousedown` / `mousemove` : the player's mousemove would
		// show the controls before a double tap had a chance to say otherwise.
		event.preventDefault();
		// A second finger : the first one's gesture stands.
		if (!touch) {
			touch = touchFrom(event, transport);
			clearTimeout(holdTimer);
			holdTimer = setTimeout(startHold, LONG_PRESS_MS);
		}
		return true;
	}

	function pointermove(event: PointerEvent) {
		if (touch?.id !== event.pointerId) {
			return;
		}
		const rect = (event.currentTarget as Element).getBoundingClientRect();
		const dx = event.clientX - rect.left - touch.x;
		const dy = event.clientY - rect.top - touch.y;
		if (touch.mode === "pending" && swipes.begin(touch, dx, dy)) {
			clearTimeout(holdTimer);
		}
		if (touch.mode === "swipe") {
			swipes.move(touch, dy);
		}
	}

	function end(event: PointerEvent, cancelled: boolean) {
		if (touch?.id !== event.pointerId) {
			return;
		}
		const ended = touch;
		touch = null;
		clearTimeout(holdTimer);
		if (ended.mode === "hold") {
			transport.rate = ended.restoreRate;
			feedback.show(null);
		} else if (ended.mode === "swipe") {
			feedback.clearLater(600);
		} else if (ended.mode === "pending" && !cancelled) {
			const point = { x: ended.x, y: ended.y, time: event.timeStamp };
			taps.tap(point, gestureZone(ended.x, ended.width), ended.controlsVisible);
		}
	}

	return {
		get enabled() {
			return deps.enabled();
		},
		get feedback() {
			return feedback.current;
		},
		/** `filter: brightness()` for the video; 1 is untouched. */
		get brightness() {
			return swipes.brightness;
		},
		pointerdown,
		pointermove,
		pointerup: (event: PointerEvent) => end(event, false),
		pointercancel: (event: PointerEvent) => end(event, true),
		/** The player is going away : no tap or feedback timer outlives it. */
		dispose() {
			clearTimeout(holdTimer);
			taps.dispose();
			feedback.dispose();
		},
	};
}
