import { describe, expect, it, vi } from "vitest";
import { createProgressReporter } from "./progress.svelte.ts";

// `$effect` never runs in this project: `flush` is what every save goes through.
function setup() {
	const media = { currentTime: 0, duration: 0 };
	const element = { readyState: 0, currentTime: 0 } as HTMLVideoElement;
	const onProgress = vi.fn();
	const reporter = createProgressReporter({
		video: () => element,
		duration: () => media.duration,
		currentTime: () => media.currentTime,
		onProgress,
	});
	return { media, element, onProgress, reporter };
}

describe("createProgressReporter", () => {
	it("reads the element while it has media, the bound position once torn down", () => {
		const { media, element, onProgress, reporter } = setup();
		media.duration = 1200;
		media.currentTime = 300;
		Object.assign(element, { readyState: 4, currentTime: 304 });
		reporter.flush();
		expect(onProgress).toHaveBeenLastCalledWith(304, 1200);
		Object.assign(element, { readyState: 0, currentTime: 0 });
		reporter.flush();
		expect(onProgress).toHaveBeenLastCalledWith(300, 1200);
	});

	it("skips a source with no duration yet", () => {
		const { media, onProgress, reporter } = setup();
		media.currentTime = 12;
		reporter.flush();
		expect(onProgress).not.toHaveBeenCalled();
	});

	it("never lets a reset to the start overwrite real progress", () => {
		const { media, onProgress, reporter } = setup();
		media.duration = 1200;
		media.currentTime = 300;
		reporter.flush();
		media.currentTime = 0;
		reporter.flush();
		expect(onProgress).toHaveBeenCalledOnce();
		expect(onProgress).toHaveBeenCalledWith(300, 1200);
	});

	it("reports the start again once the source is reset", () => {
		const { media, onProgress, reporter } = setup();
		media.duration = 1200;
		media.currentTime = 300;
		reporter.flush();
		reporter.reset();
		media.currentTime = 2;
		reporter.flush();
		expect(onProgress).toHaveBeenLastCalledWith(2, 1200);
	});
});
