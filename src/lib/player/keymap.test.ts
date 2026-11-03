import { describe, expect, it, vi } from "vitest";
import { handlePlayerKey } from "./keymap.ts";

function actions() {
	return {
		togglePlay: vi.fn(),
		seek: vi.fn(),
		seekToFraction: vi.fn(),
		changeRate: vi.fn(),
		togglePip: vi.fn(),
		toggleHelp: vi.fn(),
		adjustVolume: vi.fn(),
		toggleFullscreen: vi.fn(),
		toggleMute: vi.fn(),
		cycleCaption: vi.fn(),
		nudgeSubtitles: vi.fn(),
		toggleInfo: vi.fn(),
		next: vi.fn(),
		episodes: vi.fn(),
		closeMenus: vi.fn(),
	};
}

function key(k: string, target?: EventTarget): KeyboardEvent {
	return {
		key: k,
		target: target ?? null,
		preventDefault: vi.fn(),
	} as unknown as KeyboardEvent;
}

describe("handlePlayerKey", () => {
	it("maps speed, picture in picture, help and the digit seeks", () => {
		const a = actions();
		handlePlayerKey(key("<"), a);
		expect(a.changeRate).toHaveBeenCalledWith(-1);
		handlePlayerKey(key(">"), a);
		expect(a.changeRate).toHaveBeenCalledWith(1);
		handlePlayerKey(key("p"), a);
		expect(a.togglePip).toHaveBeenCalledOnce();
		handlePlayerKey(key("?"), a);
		expect(a.toggleHelp).toHaveBeenCalledOnce();
		expect(handlePlayerKey(key("0"), a)).toBe(true);
		expect(a.seekToFraction).toHaveBeenCalledWith(0);
		handlePlayerKey(key("7"), a);
		expect(a.seekToFraction).toHaveBeenCalledWith(0.7);
		expect(handlePlayerKey(key("x"), a)).toBe(false);
		const withCommand = { ...key("1"), metaKey: true } as KeyboardEvent;
		expect(handlePlayerKey(withCommand, a)).toBe(false);
	});

	it("maps transport keys to actions and reports handled", () => {
		const a = actions();
		expect(handlePlayerKey(key("k"), a)).toBe(true);
		expect(a.togglePlay).toHaveBeenCalledOnce();

		handlePlayerKey(key("j"), a);
		expect(a.seek).toHaveBeenCalledWith(-10);
		handlePlayerKey(key("ArrowRight"), a);
		expect(a.seek).toHaveBeenCalledWith(10);

		handlePlayerKey(key("ArrowUp"), a);
		expect(a.adjustVolume).toHaveBeenCalledWith(0.1);
		handlePlayerKey(key("ArrowDown"), a);
		expect(a.adjustVolume).toHaveBeenCalledWith(-0.1);
	});

	it("preventDefault on space so the page doesn't scroll", () => {
		const a = actions();
		const event = key(" ");
		handlePlayerKey(event, a);
		expect(event.preventDefault).toHaveBeenCalled();
		expect(a.togglePlay).toHaveBeenCalled();
	});

	it("covers the remaining shortcuts", () => {
		const a = actions();
		for (const [k, fn] of [
			["f", a.toggleFullscreen],
			["m", a.toggleMute],
			["c", a.cycleCaption],
			["i", a.toggleInfo],
			["n", a.next],
			["e", a.episodes],
			["Escape", a.closeMenus],
		] as const) {
			handlePlayerKey(key(k), a);
			expect(fn, `key ${k}`).toHaveBeenCalled();
		}
	});

	it("nudges the subtitle delay with g / h, like VLC", () => {
		const a = actions();
		expect(handlePlayerKey(key("g"), a)).toBe(true);
		expect(a.nudgeSubtitles).toHaveBeenLastCalledWith(-0.1);
		expect(handlePlayerKey(key("h"), a)).toBe(true);
		expect(a.nudgeSubtitles).toHaveBeenLastCalledWith(0.1);
	});

	it("ignores unknown keys", () => {
		const a = actions();
		expect(handlePlayerKey(key("z"), a)).toBe(false);
		expect(a.togglePlay).not.toHaveBeenCalled();
	});

	// Stands in for a focused control: `closest` matches when the selector covers
	// this element, which is what the real DOM does for the panel's buttons.
	function focused(matches: boolean): EventTarget {
		return { closest: () => (matches ? {} : null) } as unknown as EventTarget;
	}

	it("ignores keys typed into an input", () => {
		const a = actions();
		expect(handlePlayerKey(key("k", focused(true)), a)).toBe(false);
		expect(a.togglePlay).not.toHaveBeenCalled();
	});

	it("leaves keys alone when a control has focus, so its own handler runs", () => {
		const a = actions();
		const event = key(" ", focused(true));
		expect(handlePlayerKey(event, a)).toBe(false);
		expect(a.togglePlay).not.toHaveBeenCalled();
		// The killer detail: preventDefault would have eaten the button's click.
		expect(event.preventDefault).not.toHaveBeenCalled();
	});

	it("still handles keys when the focused node matches nothing", () => {
		const a = actions();
		expect(handlePlayerKey(key("k", focused(false)), a)).toBe(true);
		expect(a.togglePlay).toHaveBeenCalled();
	});

	it("closes menus on Escape even from inside a focused control", () => {
		const a = actions();
		expect(handlePlayerKey(key("Escape", focused(true)), a)).toBe(true);
		expect(a.closeMenus).toHaveBeenCalled();
	});
});
