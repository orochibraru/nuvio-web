import { describe, expect, it, vi } from "vitest";
import { handlePlayerKey } from "./player-keymap.ts";

function actions() {
	return {
		togglePlay: vi.fn(),
		seek: vi.fn(),
		adjustVolume: vi.fn(),
		toggleFullscreen: vi.fn(),
		toggleMute: vi.fn(),
		cycleCaption: vi.fn(),
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

	it("ignores unknown keys", () => {
		const a = actions();
		expect(handlePlayerKey(key("z"), a)).toBe(false);
		expect(a.togglePlay).not.toHaveBeenCalled();
	});

	it("ignores keys typed into an input", () => {
		const a = actions();
		const input = { tagName: "INPUT" } as unknown as EventTarget;
		expect(handlePlayerKey(key("k", input), a)).toBe(false);
		expect(a.togglePlay).not.toHaveBeenCalled();
	});
});
