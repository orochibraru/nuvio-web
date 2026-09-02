import { describe, expect, it, vi } from "vitest";
import {
	attachNativeAudioTracks,
	type NativeAudioTrackList,
	nativeAudioSnapshot,
	type VideoWithAudioTracks,
} from "./player-media.ts";

function trackList(
	tracks: Array<{ label: string; language: string; enabled: boolean }>,
): NativeAudioTrackList {
	const list = { length: tracks.length } as NativeAudioTrackList;
	tracks.forEach((track, index) => {
		(list as unknown as Record<number, unknown>)[index] = track;
	});
	return list;
}

describe("nativeAudioSnapshot", () => {
	it("maps each track by label, falling back to language then a placeholder", () => {
		const snapshot = nativeAudioSnapshot(
			trackList([
				{ label: "Director's commentary", language: "en", enabled: false },
				{ label: "", language: "fr", enabled: true },
				{ label: "", language: "", enabled: false },
			]),
		);
		expect(snapshot.tracks).toEqual([
			{ id: 0, label: "Director's commentary" },
			{ id: 1, label: "fr" },
			{ id: 2, label: "Track 3" },
		]);
	});

	it("reports the enabled track's index as active", () => {
		const snapshot = nativeAudioSnapshot(
			trackList([
				{ label: "English", language: "en", enabled: false },
				{ label: "Español", language: "es", enabled: true },
			]),
		);
		expect(snapshot.active).toBe(1);
	});

	it("reports -1 active when no track is enabled", () => {
		const snapshot = nativeAudioSnapshot(
			trackList([{ label: "English", language: "en", enabled: false }]),
		);
		expect(snapshot.active).toBe(-1);
	});

	it("returns an empty snapshot for an empty list", () => {
		expect(nativeAudioSnapshot(trackList([]))).toEqual({
			tracks: [],
			active: -1,
		});
	});
});

describe("attachNativeAudioTracks", () => {
	it("returns undefined when the element exposes no audioTracks list", () => {
		const el = {} as VideoWithAudioTracks;
		expect(attachNativeAudioTracks(el, vi.fn())).toBeUndefined();
	});

	it("calls onChange once immediately with the current snapshot", () => {
		const list = trackList([
			{ label: "English", language: "en", enabled: true },
		]);
		list.addEventListener = vi.fn();
		list.removeEventListener = vi.fn();
		const el = { audioTracks: list } as VideoWithAudioTracks;

		const onChange = vi.fn();
		attachNativeAudioTracks(el, onChange);

		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith([{ id: 0, label: "English" }], 0);
	});

	it("re-syncs on addtrack/removetrack/change and cleans up all three", () => {
		const listeners: Record<string, () => void> = {};
		const list = trackList([
			{ label: "English", language: "en", enabled: true },
		]);
		list.addEventListener = vi.fn((type, listener) => {
			listeners[type] = listener;
		});
		list.removeEventListener = vi.fn();
		const el = { audioTracks: list } as VideoWithAudioTracks;

		const onChange = vi.fn();
		const cleanup = attachNativeAudioTracks(el, onChange);
		expect(list.addEventListener).toHaveBeenCalledTimes(3);

		// A track was added behind the scenes : the list itself now reports two.
		(list as unknown as { length: number }).length = 2;
		(list as unknown as Record<number, unknown>)[1] = {
			label: "French",
			language: "fr",
			enabled: false,
		};
		listeners.addtrack();
		expect(onChange).toHaveBeenLastCalledWith(
			[
				{ id: 0, label: "English" },
				{ id: 1, label: "French" },
			],
			0,
		);

		cleanup?.();
		expect(list.removeEventListener).toHaveBeenCalledTimes(3);
	});
});
