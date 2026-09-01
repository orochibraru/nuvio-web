/**
 * Ask the browser whether it can decode a given video codec *before* handing a
 * source to `<video>` — the label-based `videoSupport` in `stream-format.ts` is
 * only a guess, this turns it into a yes/no on the machine we're actually on.
 *
 * The label → MIME-probe mapping is pure so it can be unit-tested; the actual
 * `MediaSource.isTypeSupported` / `canPlayType` call is a thin wrapper that
 * returns `null` when there's nothing to go on (SSR, no API, unknown codec).
 */

/**
 * A representative `codecs=` MIME string for a `stream-format` codec label, or
 * `null` when the label isn't one we probe. The exact profile/level barely
 * matters — a browser that lacks the HEVC decoder rejects every `hvc1.*`, one
 * that has it accepts the baseline string below.
 */
export function codecMimeProbe(codecLabel: string | null): string | null {
	switch (codecLabel) {
		case "HEVC":
			return 'video/mp4; codecs="hvc1.1.6.L93.B0"';
		case "AV1":
			return 'video/mp4; codecs="av01.0.05M.08"';
		case "H.264":
			return 'video/mp4; codecs="avc1.42E01E"';
		// Xvid / DivX (MPEG-4 Part 2) has no MSE-probeable string and no browser
		// decodes it from MP4 — treat as a definite miss.
		case "Xvid":
			return "video/x-msvideo";
		default:
			return null;
	}
}

export type CodecVerdict = "supported" | "unsupported" | "unknown";

/**
 * Does this browser decode `codecLabel`? `"unknown"` when we can't tell — the
 * label is unrecognised, or neither probe API is available — and callers should
 * fall back to the runtime watchdog rather than block the stream.
 */
export function browserCanPlayCodec(codecLabel: string | null): CodecVerdict {
	const mime = codecMimeProbe(codecLabel);
	if (!mime) {
		return "unknown";
	}
	if (codecLabel === "Xvid") {
		return "unsupported";
	}

	const mse = (
		globalThis as {
			MediaSource?: { isTypeSupported?: (type: string) => boolean };
		}
	).MediaSource;
	if (mse?.isTypeSupported) {
		return mse.isTypeSupported(mime) ? "supported" : "unsupported";
	}

	if (typeof document !== "undefined") {
		const canPlay = document.createElement("video").canPlayType(mime);
		if (canPlay === "probably" || canPlay === "maybe") {
			return "supported";
		}
		if (canPlay === "") {
			return "unsupported";
		}
	}

	return "unknown";
}
