import {
	blockText,
	type MkvTextBlock,
	MkvTextExtractor,
	type MkvTextTrack,
} from "./mkv-text.ts";
import { createRangeFetch } from "./range-fetch.ts";

interface Cue {
	start: number;
	end: number;
	text: string;
}

// The remux path's Matroska text subtitles, read off the bytes it downloads anyway, as `<video>` text tracks.
export class MkvTextTracks {
	readonly #extractor = new MkvTextExtractor(
		(tracks) => this.#setTracks(tracks),
		(block) => void this.#add(block),
	);
	#tracks = new Map<number, MkvTextTrack>();
	readonly #pending = new Map<number, Cue[]>();
	readonly #seen = new Set<string>();
	readonly #textTracks = new Map<number, TextTrack>();
	#element: HTMLVideoElement | null = null;
	readonly #rangeFetch = createRangeFetch();

	readonly fetch = async (
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		const response = await this.#rangeFetch(input, init);
		if (!(response.ok && response.body)) {
			return response;
		}
		const range = /^bytes=(\d+)-/.exec(
			new Headers(init?.headers).get("Range") ?? "",
		);
		let push = this.#extractor.stream(
			response.status === 206 && range ? Number(range[1]) : 0,
		);
		const body = response.body.pipeThrough(
			new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) {
					controller.enqueue(chunk);
					try {
						push(chunk);
					} catch {
						push = () => undefined;
					}
				},
			}),
		);
		const tapped = new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
		return Object.defineProperties(tapped, {
			url: { value: response.url },
			redirected: { value: response.redirected },
			type: { value: response.type },
		});
	};

	attach(element: HTMLVideoElement) {
		this.#element = element;
		this.#createTextTracks();
	}

	detach() {
		for (const textTrack of this.#textTracks.values()) {
			textTrack.mode = "disabled";
		}
		this.#element = null;
	}

	#setTracks(tracks: MkvTextTrack[]) {
		this.#tracks = new Map(tracks.map((track) => [track.number, track]));
		this.#createTextTracks();
	}

	#createTextTracks() {
		const element = this.#element;
		if (!element) {
			return;
		}
		for (const track of this.#tracks.values()) {
			if (this.#textTracks.has(track.number)) {
				continue;
			}
			const textTrack = element.addTextTrack(
				"subtitles",
				track.name,
				track.language,
			);
			textTrack.mode = "disabled";
			for (const cue of this.#pending.get(track.number) ?? []) {
				textTrack.addCue(new VTTCue(cue.start, cue.end, cue.text));
			}
			this.#pending.delete(track.number);
			this.#textTracks.set(track.number, textTrack);
		}
	}

	async #add(block: MkvTextBlock) {
		const track = this.#tracks.get(block.track);
		if (!track) {
			return;
		}
		const text = await blockText(track, block.data).catch(() => "");
		const key = `${block.track}:${block.start}:${text}`;
		if (!text || this.#seen.has(key)) {
			return;
		}
		this.#seen.add(key);
		const textTrack = this.#textTracks.get(block.track);
		if (textTrack) {
			textTrack.addCue(new VTTCue(block.start, block.end, text));
			return;
		}
		const pending = this.#pending.get(block.track) ?? [];
		pending.push({ start: block.start, end: block.end, text });
		this.#pending.set(block.track, pending);
	}
}
