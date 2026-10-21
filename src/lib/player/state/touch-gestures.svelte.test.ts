import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DOUBLE_TAP_MS,
	HOLD_RATE,
	LONG_PRESS_MS,
} from "#lib/player/gestures.js";
import { createTouchGestures } from "./touch-gestures.svelte.ts";
import type { PlayerTransportState } from "./transport-state.svelte.ts";

/**
 * The timing around `gestures.ts`: a single tap waiting out the double-tap
 * window, a double tap seeking instead, the hold restoring the rate, a swipe
 * driving volume / brightness. Pointer events are plain objects on a 300x200
 * surface.
 */

const surface = {
	getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 200 }),
};

function pointer(x: number, y: number, timeStamp = 0, pointerId = 1) {
	return {
		pointerType: "touch",
		pointerId,
		clientX: x,
		clientY: y,
		timeStamp,
		currentTarget: surface,
		preventDefault: vi.fn(),
	} as unknown as PointerEvent;
}

function setup(enabled = true) {
	const transport = $state({
		paused: false,
		volume: 0.5,
		muted: false,
		rate: 1,
		controlsVisible: false,
	}) as PlayerTransportState;
	const seek = vi.fn();
	const onTap = vi.fn();
	const gestures = createTouchGestures({
		enabled: () => enabled,
		transport,
		seek,
		onTap,
	});
	return { transport, seek, onTap, gestures, dispose: gestures.dispose };
}

function tap(
	g: ReturnType<typeof createTouchGestures>,
	x: number,
	time: number,
) {
	g.pointerdown(pointer(x, 100, time));
	g.pointerup(pointer(x, 100, time + 50));
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("createTouchGestures", () => {
	it("leaves a mouse and a disabled player to the caller", () => {
		const off = setup(false);
		expect(off.gestures.pointerdown(pointer(10, 10))).toBe(false);
		const on = setup();
		const mouse = { ...pointer(10, 10), pointerType: "mouse" } as PointerEvent;
		expect(on.gestures.pointerdown(mouse)).toBe(false);
		off.dispose();
		on.dispose();
	});

	it("runs a centre tap at once", () => {
		const { gestures, onTap, dispose } = setup();
		tap(gestures, 150, 0);
		expect(onTap).toHaveBeenCalledWith(false);
		dispose();
	});

	it("holds a side tap for the double-tap window", () => {
		const { gestures, onTap, seek, dispose } = setup();
		tap(gestures, 20, 0);
		expect(onTap).not.toHaveBeenCalled();
		vi.advanceTimersByTime(DOUBLE_TAP_MS);
		expect(onTap).toHaveBeenCalledOnce();
		expect(seek).not.toHaveBeenCalled();
		dispose();
	});

	it("seeks on a double tap, and again on each further tap", () => {
		const { gestures, onTap, seek, dispose } = setup();
		tap(gestures, 280, 0);
		tap(gestures, 280, 150);
		expect(seek).toHaveBeenLastCalledWith(10);
		tap(gestures, 280, 300);
		expect(seek).toHaveBeenCalledTimes(2);
		expect(gestures.feedback).toEqual({
			kind: "seek",
			side: "right",
			seconds: 20,
		});
		vi.advanceTimersByTime(1000);
		expect(onTap).not.toHaveBeenCalled();
		expect(gestures.feedback).toBeNull();
		dispose();
	});

	it("seeks back on the left", () => {
		const { gestures, seek, dispose } = setup();
		tap(gestures, 20, 0);
		tap(gestures, 25, 100);
		expect(seek).toHaveBeenCalledWith(-10);
		dispose();
	});

	it("plays at 2x while held, then restores the rate", () => {
		const { gestures, transport, onTap, dispose } = setup();
		transport.rate = 1.25;
		gestures.pointerdown(pointer(150, 100, 0));
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(transport.rate).toBe(HOLD_RATE);
		expect(gestures.feedback).toEqual({ kind: "speed" });
		gestures.pointerup(pointer(150, 100, 2000));
		expect(transport.rate).toBe(1.25);
		expect(onTap).not.toHaveBeenCalled();
		dispose();
	});

	it("swipes volume on the right and brightness on the left", () => {
		const { gestures, transport, dispose } = setup();
		gestures.pointerdown(pointer(250, 150, 0));
		gestures.pointermove(pointer(250, 100, 10));
		expect(transport.volume).toBe(0.75);
		gestures.pointermove(pointer(250, 300, 20));
		expect(transport.volume).toBe(0);
		expect(transport.muted).toBe(true);
		gestures.pointerup(pointer(250, 300, 30));

		gestures.pointerdown(pointer(50, 150, 100));
		gestures.pointermove(pointer(50, 250, 110));
		expect(gestures.brightness).toBeLessThan(1);
		expect(gestures.feedback?.kind).toBe("brightness");
		gestures.pointerup(pointer(50, 250, 120));
		vi.advanceTimersByTime(600);
		expect(gestures.feedback).toBeNull();
		dispose();
	});

	it("leaves a horizontal drag alone", () => {
		const { gestures, transport, onTap, dispose } = setup();
		gestures.pointerdown(pointer(150, 100, 0));
		gestures.pointermove(pointer(220, 105, 10));
		gestures.pointerup(pointer(220, 105, 20));
		vi.advanceTimersByTime(1000);
		expect(onTap).not.toHaveBeenCalled();
		expect(transport.rate).toBe(1);
		dispose();
	});
});
