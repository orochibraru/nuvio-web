import { registerAc3Decoder } from "@mediabunny/ac3";
import { registerDtsDecoder } from "@mediabunny/dts";
import {
	Conversion,
	EncodedPacketSink,
	getFirstEncodableAudioCodec,
	Input,
	type InputAudioTrack,
	type InputVideoTrack,
	MATROSKA,
	type MediaCodec,
	MP4,
	Mp4OutputFormat,
	Output,
	StreamTarget,
	UrlSource,
} from "mediabunny";
import { m } from "#lib/i18n/index.js";
import { preferredTrackIndex } from "#lib/player/audio-language.js";
import type { AudioTrackOption } from "#lib/player/media.js";
import {
	audioTrackLabel,
	bufferedAhead,
	type TimeRange,
	transmuxMime,
} from "#lib/player/transmux.js";

// Both decoders run their WASM in a worker of their own.
registerAc3Decoder();
registerDtsDecoder();

/** How far past the playhead the pipeline runs before it waits. */
const AHEAD_SECONDS = 30;
/** A host that never answers must not hold the banner or the error back forever. */
const PREPARE_TIMEOUT_MS = 15_000;
const ENCODED_CODEC_STRING = { aac: "mp4a.40.2", opus: "opus" } as const;
type EncodedCodec = keyof typeof ENCODED_CODEC_STRING;

/**
 * Why the player asks : `probe` (every direct file, as playback starts : fix
 * when the browser can't decode its audio or switch its tracks), `silent` (it plays without
 * sound), or `container` (`<video>` refused the file outright).
 */
export type TransmuxReason = "probe" | "silent" | "container";

/** The audio track to start on : an explicit index, else the first in a wanted language. */
export interface AudioPreference {
	languages: string[];
	track: number | null;
}

interface AudioPlan {
	track: InputAudioTrack;
	mime: string;
	/** MSE takes it as is : packets go through untouched. */
	copy: boolean;
	/** `<video>` decodes this codec on its own, in whatever container. */
	native: boolean;
}

interface Opened {
	video: InputVideoTrack;
	audio: AudioPlan[];
	encoded: EncodedCodec | null;
	active: number;
	duration: number;
}

interface Attachment {
	el: HTMLVideoElement;
	mediaSource: MediaSource;
	buffer: SourceBuffer;
	mime: string;
	onFatal: (message: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ranges(buffered: TimeRanges): TimeRange[] {
	const list: TimeRange[] = [];
	for (let index = 0; index < buffered.length; index++) {
		list.push({ start: buffered.start(index), end: buffered.end(index) });
	}
	return list;
}

function ahead(el: HTMLVideoElement) {
	return bufferedAhead(ranges(el.buffered), el.currentTime);
}

function idle(buffer: SourceBuffer) {
	return buffer.updating
		? new Promise((resolve) =>
				buffer.addEventListener("updateend", resolve, { once: true }),
			)
		: Promise.resolve();
}

/**
 * Opens `src` in the browser and checks the fix can work : the host allows
 * CORS range reads, the video codec plays through MSE, and there is an audio
 * track to copy or one the WASM decoders handle. Touches no element; `null`
 * means leave playback as it is.
 */
export async function prepareTransmux(
	src: string,
	reason: TransmuxReason,
	preference: AudioPreference,
): Promise<TransmuxSession | null> {
	if (typeof MediaSource === "undefined") {
		return null;
	}
	// A dead link fails at once while probing; a blip mid-film keeps retrying.
	const retry: { live: boolean } = { live: false };
	const input = new Input({
		source: new UrlSource(src, {
			requestInit: { credentials: "omit" },
			getRetryDelay: (attempts) =>
				retry.live ? Math.min(0.5 * 2 ** attempts, 8) : null,
		}),
		formats: [MATROSKA, MP4],
	});
	const opened = await Promise.race([
		open(input, reason, preference).catch(() => null),
		sleep(PREPARE_TIMEOUT_MS).then(() => null),
	]);
	if (!opened) {
		input.dispose();
		return null;
	}
	retry.live = true;
	return new TransmuxSession(input, opened);
}

async function encodableCodec(): Promise<EncodedCodec | null> {
	const first = await getFirstEncodableAudioCodec(["aac", "opus"], {
		numberOfChannels: 2,
	});
	return first === "aac" || first === "opus" ? first : null;
}

const AUDIO_CONTAINERS = ["audio/mp4", "audio/webm", "audio/ogg"];

/** Whether `<video>` plays this audio codec by itself, whatever MSE accepts. */
function decodesNatively(codecString: string | null): boolean {
	if (!codecString) {
		return false;
	}
	const probe = document.createElement("video");
	return AUDIO_CONTAINERS.some(
		(container) =>
			probe.canPlayType(`${container}; codecs="${codecString}"`) !== "",
	);
}

async function planAudio(
	track: InputAudioTrack,
	context: {
		videoCodec: string;
		reason: TransmuxReason;
		copyable: MediaCodec[];
		encoded: EncodedCodec | null;
	},
): Promise<AudioPlan | null> {
	const codecString = await track.getCodecParameterString();
	const copyMime = codecString
		? transmuxMime(context.videoCodec, codecString)
		: null;
	// A track that played silent is never trusted to play as is.
	if (
		context.reason !== "silent" &&
		track.codec &&
		context.copyable.includes(track.codec) &&
		copyMime &&
		MediaSource.isTypeSupported(copyMime)
	) {
		return { track, mime: copyMime, copy: true, native: true };
	}
	if (!(context.encoded && (await track.canDecode()))) {
		return null;
	}
	const mime = transmuxMime(
		context.videoCodec,
		ENCODED_CODEC_STRING[context.encoded],
	);
	return MediaSource.isTypeSupported(mime)
		? { track, mime, copy: false, native: decodesNatively(codecString) }
		: null;
}

/** The plan to start on, and whether `<video>` alone would have played it. */
function startingTrack(
	audio: AudioPlan[],
	primaryId: number | undefined,
	preference: AudioPreference,
) {
	const primary = Math.max(
		0,
		audio.findIndex((plan) => plan.track.id === primaryId),
	);
	const wanted =
		preference.track !== null && audio[preference.track]
			? preference.track
			: preferredTrackIndex(
					audio.map((plan) => ({ language: plan.track.languageCode })),
					preference.languages,
				);
	const active = wanted === -1 ? primary : wanted;
	// Browsers without a track switcher play the file's first or default track.
	const theirs = wanted === -1 || (active === primary && active === 0);
	return { active, native: audio[active].native && theirs };
}

async function open(
	input: Input,
	reason: TransmuxReason,
	preference: AudioPreference,
): Promise<Opened | null> {
	const video = await input.getPrimaryVideoTrack();
	const videoCodec = await video?.getCodecParameterString();
	if (!(video && videoCodec)) {
		return null;
	}
	const encoded = await encodableCodec();
	const copyable = new Mp4OutputFormat().getSupportedCodecs();
	const plans = await Promise.all(
		(await input.getAudioTracks()).map((track) =>
			planAudio(track, { videoCodec, reason, copyable, encoded }),
		),
	);
	const audio = plans.filter((plan) => plan !== null);
	if (audio.length === 0) {
		return null;
	}
	const primary = await input.getPrimaryAudioTrack();
	const { active, native } = startingTrack(audio, primary?.id, preference);
	// Direct files need MSE for track selection when the native API is absent.
	const needsTrackSelection =
		audio.length > 1 && !("audioTracks" in document.createElement("video"));
	if (reason === "probe" && native && !needsTrackSelection) {
		return null;
	}
	const duration = await input.computeDuration();
	return { video, audio, encoded, active, duration };
}

/**
 * One file re-muxed into a `<video>` through MSE : video packets untouched,
 * each audio track copied when the browser decodes it, else decoded in WASM
 * and re-encoded to stereo. Runs `AHEAD_SECONDS` past the playhead and restarts
 * from the keyframe before any seek that leaves the buffer.
 */
export class TransmuxSession {
	readonly audioTracks: AudioTrackOption[];
	readonly #input: Input;
	readonly #opened: Opened;
	readonly #keyPackets: EncodedPacketSink;
	#active: number;
	#disposed = false;
	#generation = 0;
	#conversion: Conversion | null = null;
	/** The time the running pipeline was started for, until its data lands. */
	#pendingTarget: number | null = null;
	#attached: Attachment | null = null;

	constructor(input: Input, opened: Opened) {
		this.#input = input;
		this.#opened = opened;
		this.#active = opened.active;
		this.#keyPackets = new EncodedPacketSink(opened.video);
		this.audioTracks = opened.audio.map((plan, index) => ({
			id: index,
			label: audioTrackLabel(
				plan.track,
				m.player_audio_track_fallback({ number: index + 1 }),
			),
			language: plan.track.languageCode,
		}));
	}

	get activeAudioTrack() {
		return this.#active;
	}

	/** The active audio track is decoded and re-encoded, not copied. */
	get converting() {
		return !this.#opened.audio[this.#active].copy;
	}

	get disposed() {
		return this.#disposed;
	}

	/** Takes over the element at `startAt`. Returns the teardown, which disposes. */
	attach(
		el: HTMLVideoElement,
		startAt: number,
		onFatal: (message: string) => void,
	): () => void {
		const mediaSource = new MediaSource();
		const objectUrl = URL.createObjectURL(mediaSource);
		const onSeeking = () => {
			if (el.currentTime !== this.#pendingTarget && ahead(el) === 0) {
				void this.#restart(el.currentTime);
			}
		};
		mediaSource.addEventListener(
			"sourceopen",
			() => {
				// biome-ignore lint/suspicious/noUnnecessaryConditions: dispose() sets it (Biome 2.5.14 infers the field as its initial `false`)
				if (this.#disposed) {
					return;
				}
				const mime = this.#opened.audio[this.#active].mime;
				const buffer = mediaSource.addSourceBuffer(mime);
				mediaSource.duration = this.#opened.duration;
				this.#attached = { el, mediaSource, buffer, mime, onFatal };
				el.currentTime = startAt;
				el.addEventListener("seeking", onSeeking);
				void this.#restart(startAt);
			},
			{ once: true },
		);
		el.src = objectUrl;
		return () => {
			this.dispose();
			el.removeEventListener("seeking", onSeeking);
			URL.revokeObjectURL(objectUrl);
			el.removeAttribute("src");
			el.load();
		};
	}

	selectAudioTrack(id: number) {
		if (!this.#attached || id === this.#active || !this.#opened.audio[id]) {
			return;
		}
		this.#active = id;
		void this.#restart(this.#attached.el.currentTime);
	}

	dispose() {
		// biome-ignore lint/suspicious/noUnnecessaryConditions: dispose() sets it (Biome 2.5.14 infers the field as its initial `false`)
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#generation += 1;
		void this.#conversion?.cancel().catch(() => undefined);
		this.#conversion = null;
		this.#attached = null;
		this.#input.dispose();
	}

	/** Full : drop what's behind the playhead, then wait for it to advance. */
	async #evict({ el, buffer }: Attachment) {
		const behind = el.currentTime - 10;
		if (behind > 0) {
			buffer.remove(0, behind);
			await idle(buffer);
		}
		await sleep(500);
	}

	/** False when the buffer was full : room was made, try again. */
	async #tryAppend(
		attached: Attachment,
		data: Uint8Array<ArrayBuffer>,
		mine: number,
	) {
		await idle(attached.buffer);
		if (mine !== this.#generation) {
			return true;
		}
		try {
			attached.buffer.appendBuffer(data);
		} catch (error) {
			if ((error as DOMException).name !== "QuotaExceededError") {
				throw error;
			}
			await this.#evict(attached);
			return false;
		}
		await idle(attached.buffer);
		if (ahead(attached.el) > 0) {
			this.#pendingTarget = null;
		}
		return true;
	}

	async #append(data: Uint8Array<ArrayBuffer>, mine: number) {
		while (this.#attached && mine === this.#generation) {
			// biome-ignore lint/performance/noAwaitInLoops: one buffer, one append at a time, retried until it fits
			if (await this.#tryAppend(this.#attached, data, mine)) {
				return;
			}
		}
	}

	/** Stops the running pipeline and empties the buffer. False when superseded. */
	async #reset({ mediaSource, buffer }: Attachment, mine: number) {
		const previous = this.#conversion;
		this.#conversion = null;
		await previous?.cancel().catch(() => undefined);
		await idle(buffer);
		if (mine !== this.#generation) {
			return false;
		}
		if (mediaSource.readyState === "open") {
			buffer.abort();
		}
		if (buffer.buffered.length > 0) {
			buffer.remove(0, Number.POSITIVE_INFINITY);
			await idle(buffer);
		}
		return mine === this.#generation;
	}

	#output(el: HTMLVideoElement, mine: number) {
		return new Output({
			format: new Mp4OutputFormat({
				fastStart: "fragmented",
				minimumFragmentDuration: 1,
			}),
			target: new StreamTarget(
				new WritableStream({
					write: async (chunk) => {
						await this.#append(chunk.data, mine);
						while (mine === this.#generation && ahead(el) > AHEAD_SECONDS) {
							// biome-ignore lint/performance/noAwaitInLoops: backpressure, polled until the playhead catches up
							await sleep(250);
						}
					},
				}),
			),
		});
	}

	async #restart(time: number) {
		const attached = this.#attached;
		if (!attached) {
			return;
		}
		const mine = ++this.#generation;
		this.#pendingTarget = time;
		if (!(await this.#reset(attached, mine))) {
			return;
		}
		const key =
			time > 0
				? await this.#keyPackets.getKeyPacket(time, { metadataOnly: true })
				: null;
		const start = key?.timestamp ?? (await this.#input.getFirstTimestamp());
		if (mine !== this.#generation) {
			return;
		}
		const plan = this.#opened.audio[this.#active];
		if (plan.mime !== attached.mime) {
			attached.buffer.changeType(plan.mime);
			attached.mime = plan.mime;
		}
		// Fragments are written from 0; this puts them back on the file's clock.
		attached.buffer.timestampOffset = start;
		const conversion = await this.#convert(attached.el, plan, start, mine);
		if (mine !== this.#generation) {
			return;
		}
		this.#conversion = conversion;
		this.#run(conversion, attached, mine);
	}

	#convert(el: HTMLVideoElement, plan: AudioPlan, start: number, mine: number) {
		const { video, encoded } = this.#opened;
		return Conversion.init({
			input: this.#input,
			output: this.#output(el, mine),
			tracks: "all",
			trim: { start },
			video: (track) => (track.id === video.id ? {} : { discard: true }),
			audio: (track) => {
				if (track.id !== plan.track.id) {
					return { discard: true };
				}
				return plan.copy || !encoded
					? {}
					: { codec: encoded, numberOfChannels: 2, forceTranscode: true };
			},
			tags: {},
			showWarnings: false,
		});
	}

	#run(conversion: Conversion, attached: Attachment, mine: number) {
		const { mediaSource, buffer, onFatal } = attached;
		conversion
			.execute()
			.then(async () => {
				await idle(buffer);
				if (mine === this.#generation && mediaSource.readyState === "open") {
					mediaSource.endOfStream();
				}
			})
			.catch(() => {
				if (mine === this.#generation) {
					onFatal(m.player_error_stream());
				}
			});
	}
}
