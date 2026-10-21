/**
 * The touch player's gesture maths, kept pure so it stays unit-testable: which
 * part of the picture a touch landed on, whether two taps make a double tap,
 * when a drag becomes a swipe, and what a vertical swipe sets a level to.
 */

export type GestureZone = "left" | "center" | "right";

/** Seconds one double tap (and each further tap in the burst) seeks. */
export const GESTURE_SEEK_SECONDS = 10;
/** Two taps further apart than this are two single taps. */
export const DOUBLE_TAP_MS = 300;
/** ... and further apart than this (px) are two single taps too. */
export const DOUBLE_TAP_DISTANCE = 60;
/** Held this long without moving : the 2x speed hold. */
export const LONG_PRESS_MS = 450;
/** A touch that travels further than this (px) is a drag, not a tap. */
export const DRAG_THRESHOLD = 12;
/** Playback rate while a long press holds. */
export const HOLD_RATE = 2;

export interface LevelRange {
	min: number;
	max: number;
}

export const VOLUME_RANGE: LevelRange = { min: 0, max: 1 };
/** `filter: brightness()` bounds : below the screen's own, up to a boost. */
export const BRIGHTNESS_RANGE: LevelRange = { min: 0.2, max: 1.5 };

/** Left / right thirds seek on a double tap; the middle third doesn't. */
export function gestureZone(x: number, width: number): GestureZone {
	if (width <= 0) {
		return "center";
	}
	const ratio = x / width;
	if (ratio < 1 / 3) {
		return "left";
	}
	if (ratio > 2 / 3) {
		return "right";
	}
	return "center";
}

/** The swipe half a drag starting at `x` drives : right is volume. */
export function swipeSide(x: number, width: number): "left" | "right" {
	return x < width / 2 ? "left" : "right";
}

export interface TapPoint {
	x: number;
	y: number;
	time: number;
}

export function isDoubleTap(
	previous: TapPoint | null,
	next: TapPoint,
): boolean {
	if (!previous) {
		return false;
	}
	return (
		next.time - previous.time <= DOUBLE_TAP_MS &&
		Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_TAP_DISTANCE
	);
}

/**
 * Whether a drag of (`dx`, `dy`) has become a vertical swipe (`true`), is
 * something else (`false` : horizontal, left to the browser), or is still a
 * tap (`null`).
 */
export function classifyDrag(dx: number, dy: number): boolean | null {
	if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
		return null;
	}
	return Math.abs(dy) > Math.abs(dx);
}

/**
 * A level after swiping `dy` px (negative is up) from `start`: one swipe across
 * `span` px of the surface covers the whole `[min, max]` range.
 */
export function swipeLevel(
	start: number,
	dy: number,
	span: number,
	{ min, max }: LevelRange,
): number {
	if (span <= 0) {
		return start;
	}
	const next = start - (dy / span) * (max - min);
	return Number(Math.min(max, Math.max(min, next)).toFixed(2));
}
