import { describe, expect, it } from "vitest";
import {
	BRIGHTNESS_RANGE,
	classifyDrag,
	DOUBLE_TAP_MS,
	gestureZone,
	isDoubleTap,
	swipeLevel,
	swipeSide,
	VOLUME_RANGE,
} from "./gestures.ts";

describe("gestureZone", () => {
	it("splits the picture in thirds", () => {
		expect(gestureZone(10, 300)).toBe("left");
		expect(gestureZone(150, 300)).toBe("center");
		expect(gestureZone(290, 300)).toBe("right");
	});

	it("reads a zero-width surface as the middle", () => {
		expect(gestureZone(10, 0)).toBe("center");
	});
});

describe("swipeSide", () => {
	it("halves the picture", () => {
		expect(swipeSide(149, 300)).toBe("left");
		expect(swipeSide(151, 300)).toBe("right");
	});
});

describe("isDoubleTap", () => {
	const first = { x: 50, y: 50, time: 1000 };

	it("needs a previous tap", () => {
		expect(isDoubleTap(null, first)).toBe(false);
	});

	it("accepts a quick tap close by", () => {
		expect(isDoubleTap(first, { x: 60, y: 55, time: 1200 })).toBe(true);
	});

	it("rejects a slow second tap", () => {
		expect(
			isDoubleTap(first, { x: 50, y: 50, time: 1000 + DOUBLE_TAP_MS + 1 }),
		).toBe(false);
	});

	it("rejects a second tap far away", () => {
		expect(isDoubleTap(first, { x: 250, y: 50, time: 1100 })).toBe(false);
	});
});

describe("classifyDrag", () => {
	it("is still a tap under the threshold", () => {
		expect(classifyDrag(3, 4)).toBeNull();
	});

	it("tells vertical from horizontal", () => {
		expect(classifyDrag(2, -30)).toBe(true);
		expect(classifyDrag(30, 5)).toBe(false);
	});
});

describe("swipeLevel", () => {
	it("raises the level swiping up", () => {
		expect(swipeLevel(0.5, -100, 400, VOLUME_RANGE)).toBe(0.75);
	});

	it("lowers it swiping down", () => {
		expect(swipeLevel(0.5, 100, 400, VOLUME_RANGE)).toBe(0.25);
	});

	it("clamps to the range", () => {
		expect(swipeLevel(0.9, -400, 400, VOLUME_RANGE)).toBe(1);
		expect(swipeLevel(0.3, 800, 400, BRIGHTNESS_RANGE)).toBe(0.2);
	});

	it("leaves a zero-height surface alone", () => {
		expect(swipeLevel(0.4, -50, 0, VOLUME_RANGE)).toBe(0.4);
	});
});
