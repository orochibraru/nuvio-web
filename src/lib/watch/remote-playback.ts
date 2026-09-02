/**
 * Casting to a TV, with no third-party SDK: the standard Remote Playback API
 * (`video.remote` — Chrome/Edge, which covers Chromecast) with WebKit's
 * AirPlay hooks as a fallback (Safari implements the vendor-prefixed pair
 * instead). Neither is in lib.dom's types, hence the shapes below.
 */

export type RemotePlaybackState = "disconnected" | "connecting" | "connected";

// Optional members are the ones implementations actually differ on, so the
// guards below aren't dead code.
interface StandardRemote {
	state?: RemotePlaybackState;
	prompt: () => Promise<void>;
	watchAvailability: (
		callback: (available: boolean) => void,
	) => Promise<number>;
	cancelWatchAvailability?: (id?: number) => Promise<void>;
	addEventListener: (type: string, listener: () => void) => void;
	removeEventListener: (type: string, listener: () => void) => void;
}

export type VideoWithRemote = HTMLVideoElement & {
	remote?: StandardRemote;
	/** WebKit/AirPlay. */
	webkitShowPlaybackTargetPicker?: () => void;
	webkitCurrentPlaybackTargetIsWireless?: boolean;
};

/** Whether this element can offer *any* cast affordance at all. */
export function castKind(
	el: VideoWithRemote | null,
): "remote-playback" | "airplay" | null {
	if (!el) {
		return null;
	}
	if (el.remote && typeof el.remote.prompt === "function") {
		return "remote-playback";
	}
	if (typeof el.webkitShowPlaybackTargetPicker === "function") {
		return "airplay";
	}
	return null;
}

/**
 * Opens the device picker. Returns false when there's nothing to open, or
 * when the viewer dismissed the picker (a rejected `prompt()` — including
 * `NotAllowedError` when it wasn't a user gesture), so the caller can decide
 * whether that's worth surfacing.
 */
export async function promptForDevice(
	el: VideoWithRemote | null,
): Promise<boolean> {
	const kind = castKind(el);
	if (!(el && kind)) {
		return false;
	}
	try {
		if (kind === "remote-playback") {
			await el.remote?.prompt();
		} else {
			el.webkitShowPlaybackTargetPicker?.();
		}
		return true;
	} catch {
		// Dismissed, or no device was picked — not an error worth shouting about.
		return false;
	}
}

/**
 * Subscribes to "is there a device to cast to" and "are we casting right
 * now". Calls `onChange` immediately with the current view and again on every
 * change. Returns a cleanup, or `undefined` when this element supports
 * neither API.
 */
export function watchRemotePlayback(
	el: VideoWithRemote | null,
	onChange: (available: boolean, state: RemotePlaybackState) => void,
): (() => void) | undefined {
	const kind = castKind(el);
	if (!(el && kind)) {
		return undefined;
	}

	if (kind === "remote-playback") {
		const remote = el.remote as StandardRemote;
		let available = false;
		const emit = () => onChange(available, remote.state ?? "disconnected");
		const onAvailability = (next: boolean) => {
			available = next;
			emit();
		};
		let watchId: number | undefined;
		void remote
			.watchAvailability(onAvailability)
			.then((id) => {
				watchId = id;
			})
			.catch(() => {
				// Some builds reject when the media has no source yet — the
				// connect/disconnect events below still keep `state` honest.
			});
		remote.addEventListener("connect", emit);
		remote.addEventListener("connecting", emit);
		remote.addEventListener("disconnect", emit);
		emit();
		return () => {
			remote.removeEventListener("connect", emit);
			remote.removeEventListener("connecting", emit);
			remote.removeEventListener("disconnect", emit);
			void remote.cancelWatchAvailability?.(watchId).catch(() => {
				// Nothing to cancel — fine.
			});
		};
	}

	// AirPlay: availability arrives on an event whose `availability` field is
	// "available" / "not-available", and the wireless flag says whether we're
	// currently playing to a target.
	let available = false;
	const emit = () =>
		onChange(
			available,
			el.webkitCurrentPlaybackTargetIsWireless ? "connected" : "disconnected",
		);
	const onAvailability = (event: Event) => {
		available =
			(event as Event & { availability?: string }).availability === "available";
		emit();
	};
	el.addEventListener(
		"webkitplaybacktargetavailabilitychanged",
		onAvailability,
	);
	el.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", emit);
	emit();
	return () => {
		el.removeEventListener(
			"webkitplaybacktargetavailabilitychanged",
			onAvailability,
		);
		el.removeEventListener(
			"webkitcurrentplaybacktargetiswirelesschanged",
			emit,
		);
	};
}
