import { describe, expect, it, vi } from "vitest";
import {
	castKind,
	promptForDevice,
	type VideoWithRemote,
	watchRemotePlayback,
} from "./remote-playback.ts";

function standardEl(over: Record<string, unknown> = {}) {
	const listeners: Record<string, () => void> = {};
	const remote = {
		state: "disconnected" as const,
		prompt: vi.fn(async () => undefined),
		watchAvailability: vi.fn(
			async (_callback: (available: boolean) => void) => 7,
		),
		cancelWatchAvailability: vi.fn(async () => undefined),
		addEventListener: vi.fn((type: string, listener: () => void) => {
			listeners[type] = listener;
		}),
		removeEventListener: vi.fn(),
		...over,
	};
	return { el: { remote } as unknown as VideoWithRemote, remote, listeners };
}

function airplayEl() {
	const listeners: Record<string, (event: Event) => void> = {};
	const el = {
		webkitShowPlaybackTargetPicker: vi.fn(),
		webkitCurrentPlaybackTargetIsWireless: false,
		addEventListener: vi.fn((type: string, listener: (e: Event) => void) => {
			listeners[type] = listener;
		}),
		removeEventListener: vi.fn(),
	} as unknown as VideoWithRemote;
	return { el, listeners };
}

describe("castKind", () => {
	it("prefers the standard Remote Playback API", () => {
		expect(castKind(standardEl().el)).toBe("remote-playback");
	});

	it("falls back to AirPlay when only WebKit's hook exists", () => {
		expect(castKind(airplayEl().el)).toBe("airplay");
	});

	it("is null for a plain element or no element", () => {
		expect(castKind({} as VideoWithRemote)).toBeNull();
		expect(castKind(null)).toBeNull();
	});
});

describe("promptForDevice", () => {
	it("opens the standard picker", async () => {
		const { el, remote } = standardEl();
		expect(await promptForDevice(el)).toBe(true);
		expect(remote.prompt).toHaveBeenCalled();
	});

	it("opens AirPlay's picker on WebKit", async () => {
		const { el } = airplayEl();
		expect(await promptForDevice(el)).toBe(true);
		expect(el.webkitShowPlaybackTargetPicker).toHaveBeenCalled();
	});

	it("reports false when the viewer dismisses the picker", async () => {
		const { el } = standardEl({
			prompt: vi.fn(async () => {
				throw new Error("NotAllowedError");
			}),
		});
		expect(await promptForDevice(el)).toBe(false);
	});

	it("reports false when nothing supports casting", async () => {
		expect(await promptForDevice({} as VideoWithRemote)).toBe(false);
		expect(await promptForDevice(null)).toBe(false);
	});
});

describe("watchRemotePlayback", () => {
	it("returns undefined when neither API exists", () => {
		expect(watchRemotePlayback({} as VideoWithRemote, vi.fn())).toBeUndefined();
	});

	it("reports availability and connection changes, then cleans up", async () => {
		const { el, remote, listeners } = standardEl();
		const onChange = vi.fn();
		const cleanup = watchRemotePlayback(el, onChange);

		// Initial emit: nothing found yet, not connected.
		expect(onChange).toHaveBeenCalledWith(false, "disconnected");

		// A device showed up on the network.
		const availabilityCb = remote.watchAvailability.mock
			.calls[0][0] as unknown as (available: boolean) => void;
		availabilityCb(true);
		expect(onChange).toHaveBeenLastCalledWith(true, "disconnected");

		// …and the viewer connected to it.
		(remote as { state: string }).state = "connected";
		listeners.connect();
		expect(onChange).toHaveBeenLastCalledWith(true, "connected");

		cleanup?.();
		expect(remote.removeEventListener).toHaveBeenCalledTimes(3);
	});

	it("tracks AirPlay availability and the wireless flag", () => {
		const { el, listeners } = airplayEl();
		const onChange = vi.fn();
		const cleanup = watchRemotePlayback(el, onChange);
		expect(onChange).toHaveBeenCalledWith(false, "disconnected");

		listeners.webkitplaybacktargetavailabilitychanged({
			availability: "available",
		} as unknown as Event);
		expect(onChange).toHaveBeenLastCalledWith(true, "disconnected");

		(
			el as { webkitCurrentPlaybackTargetIsWireless?: boolean }
		).webkitCurrentPlaybackTargetIsWireless = true;
		listeners.webkitcurrentplaybacktargetiswirelesschanged(
			undefined as unknown as Event,
		);
		expect(onChange).toHaveBeenLastCalledWith(true, "connected");

		cleanup?.();
		expect(el.removeEventListener).toHaveBeenCalledTimes(2);
	});
});
