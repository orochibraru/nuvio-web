<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CaptionsIcon from "@lucide/svelte/icons/captions";
	import CaptionsOffIcon from "@lucide/svelte/icons/captions-off";
	import CheckIcon from "@lucide/svelte/icons/check";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import ListVideoIcon from "@lucide/svelte/icons/list-video";
	import MaximizeIcon from "@lucide/svelte/icons/maximize";
	import MinimizeIcon from "@lucide/svelte/icons/minimize";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PictureInPictureIcon from "@lucide/svelte/icons/picture-in-picture-2";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import SkipForwardIcon from "@lucide/svelte/icons/skip-forward";
	import Volume1Icon from "@lucide/svelte/icons/volume-1";
	import Volume2Icon from "@lucide/svelte/icons/volume-2";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import XIcon from "@lucide/svelte/icons/x";
	import Hls from "hls.js";
	import { onDestroy } from "svelte";
	import PlaybackLoading from "$lib/components/playback-loading.svelte";
	import {
		SUBTITLE_SIZES,
		type SubtitleSize,
		subtitleFontSize,
	} from "$lib/settings/ui-settings.js";
	import { cn } from "$lib/utils.js";

	type SubtitleTrack = {
		id?: string;
		lang: string;
		url: string;
		addonName?: string;
		sdh?: boolean;
	};

	type SubtitleAppearance = {
		subtitleSize?: SubtitleSize;
		subtitleColor?: string;
		subtitleBackground?: boolean;
	};

	let {
		src,
		poster = null,
		logo = null,
		title,
		subheading = null,
		startTime = 0,
		subtitles = [],
		fill = false,
		certification = null,
		genres = [],
		subtitleSize = "medium",
		subtitleColor = "#ffffff",
		subtitleBackground = true,
		preferredLanguage = "",
		audioRisky = false,
		onProgress,
		onEnded,
		onBack,
		onSources,
		onSubtitleAppearance,
		onEpisodes,
		onNext,
	}: {
		src: string;
		poster?: string | null;
		logo?: string | null;
		title: string;
		subheading?: string | null;
		startTime?: number;
		subtitles?: SubtitleTrack[];
		/** Fill the parent instead of holding a 16:9 box (full-page player). */
		fill?: boolean;
		certification?: string | null;
		genres?: string[];
		subtitleSize?: SubtitleSize;
		subtitleColor?: string;
		subtitleBackground?: boolean;
		preferredLanguage?: string;
		/** The stream label hints at an audio codec the browser can't decode. */
		audioRisky?: boolean;
		onProgress?: (position: number, duration: number) => void;
		onEnded?: () => void;
		onBack?: () => void;
		onSources?: () => void;
		onSubtitleAppearance?: (patch: SubtitleAppearance) => void;
		/** Series only: open the episode drawer. */
		onEpisodes?: () => void;
		/** Series only: jump to the next episode. */
		onNext?: () => void;
	} = $props();

	let container = $state<HTMLDivElement | null>(null);
	let video = $state<HTMLVideoElement | null>(null);

	let paused = $state(true);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let muted = $state(false);
	let buffered = $state<Array<{ start: number; end: number }>>([]);
	let rate = $state(1);
	let fullscreen = $state(false);
	let fatalError = $state<string | null>(null);
	let loading = $state(true);
	let ended = $state(false);
	let controlsVisible = $state(true);
	let settingsOpen = $state(false);
	let subtitlesOpen = $state(false);
	let activeCaption = $state<string | null>(null);
	let seeded = false;
	// One silent reload is attempted on a recoverable media error before we
	// surface a fatal screen; reset whenever the source changes.
	let recoveryAttempted = false;

	// Subtitle timing nudge (seconds), applied as a delta to the showing track's
	// cues. Resets when the track changes.
	let subtitleOffset = $state(0);

	// Audio tracks — only exposed for HLS streams (hls.js drives the switch).
	let hls: Hls | null = $state(null);
	let audioTracks = $state<Array<{ id: number; label: string }>>([]);
	let activeAudioTrack = $state(-1);

	// Hover-scrub preview.
	let scrubTrack = $state<HTMLDivElement | null>(null);
	let hoverRatio = $state<number | null>(null);

	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let progressTimer: ReturnType<typeof setInterval> | undefined;

	const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
	const sizeLabels: Record<SubtitleSize, string> = {
		small: "Small",
		medium: "Medium",
		large: "Large",
	};
	const swatches = ["#ffffff", "#ffe14d", "#7fd4ff", "#9dffb0", "#ff9db1"];

	const bufferedEnd = $derived(buffered.at(-1)?.end ?? 0);
	const progressRatio = $derived(duration ? currentTime / duration : 0);
	const bufferedRatio = $derived(duration ? bufferedEnd / duration : 0);

	const cueFontSize = $derived(subtitleFontSize(subtitleSize));
	const cueBackground = $derived(
		subtitleBackground ? "rgba(0,0,0,0.75)" : "transparent",
	);

	const trackKey = (track: SubtitleTrack, index: number): string =>
		track.id ?? `${track.lang}:${index}`;

	const options = $derived(
		subtitles.map((track, index) => ({
			...track,
			key: trackKey(track, index),
			name: langName(track.lang),
		})),
	);
	const menuOpen = $derived(settingsOpen || subtitlesOpen);

	let autoSubDone = false;

	function langName(code: string): string {
		const raw = code.trim();
		const short = raw.toLowerCase().slice(0, 2);
		try {
			const resolved = new Intl.DisplayNames(["en"], { type: "language" }).of(
				short,
			);
			if (resolved && resolved.toLowerCase() !== short) {
				return resolved;
			}
		} catch {
			// Intl.DisplayNames unsupported — fall through.
		}
		return raw.toUpperCase();
	}

	function langMatches(a: string, b: string): boolean {
		const x = a.trim().toLowerCase().slice(0, 3);
		const y = b.trim().toLowerCase().slice(0, 3);
		return x.length > 0 && (x.startsWith(y) || y.startsWith(x));
	}

	$effect(() => {
		const el = video;
		if (!el || !src) {
			return;
		}
		fatalError = null;
		recoveryAttempted = false;
		seeded = false;
		loading = true;
		ended = false;
		autoSubDone = false;

		subtitleOffset = 0;
		audioTracks = [];
		activeAudioTrack = -1;

		if (src.toLowerCase().includes(".m3u8") && Hls.isSupported()) {
			const instance = new Hls({ maxBufferLength: 30 });
			hls = instance;
			instance.loadSource(src);
			instance.attachMedia(el);
			instance.on(Hls.Events.ERROR, (_event, data) => {
				if (data.fatal) {
					fatalError = "This stream could not be played.";
				}
			});
			const syncAudio = () => {
				audioTracks = instance.audioTracks.map((track, index) => ({
					id: index,
					label: track.name || track.lang || `Track ${index + 1}`,
				}));
				activeAudioTrack = instance.audioTrack;
			};
			instance.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncAudio);
			instance.on(Hls.Events.AUDIO_TRACK_SWITCHED, syncAudio);
			return () => {
				instance.destroy();
				hls = null;
			};
		}

		el.src = src;
		el.load();
		return () => {
			el.removeAttribute("src");
			el.load();
		};
	});

	$effect(() => {
		if (video) {
			video.playbackRate = rate;
		}
	});

	$effect(() => {
		progressTimer = setInterval(() => {
			if (video && !video.paused && duration > 0) {
				onProgress?.(currentTime, duration);
			}
		}, 15_000);
		return () => clearInterval(progressTimer);
	});

	onDestroy(() => {
		if (video && duration > 0) {
			onProgress?.(video.currentTime, duration);
		}
	});

	function onLoadedMetadata() {
		if (!seeded && startTime > 0 && video) {
			video.currentTime = startTime;
			seeded = true;
		}
	}

	function onReady() {
		loading = false;
		ended = false;
		if (!autoSubDone && preferredLanguage && !activeCaption) {
			autoSubDone = true;
			const match = options.find((entry) =>
				langMatches(entry.lang, preferredLanguage),
			);
			if (match) {
				setCaption(match.key);
			}
		}
	}

	function onWaiting() {
		loading = true;
	}

	function onMediaError() {
		// The HLS path reports its own fatals via `Hls.Events.ERROR`.
		if (src.toLowerCase().includes(".m3u8")) {
			return;
		}
		const mediaError = video?.error;
		const code = mediaError?.code;

		// `SRC_NOT_SUPPORTED` (4) means the container/codec can't be played at
		// all — no point retrying.
		if (!mediaError || code === mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
			fatalError =
				"This source can't play in the browser. Its container or codec isn't supported.";
			loading = false;
			return;
		}

		// A network / decode error mid-load (debrid + torrent links stall and
		// hiccup): try one silent reload from the last position before giving up.
		if (!recoveryAttempted && video) {
			recoveryAttempted = true;
			const resumeAt = currentTime;
			loading = true;
			video.load();
			video.currentTime = resumeAt;
			void video.play().catch(() => {});
			return;
		}

		fatalError = "This source stopped playing and couldn't be recovered.";
		loading = false;
	}

	// Best-effort detection of a source that plays video but no audio (an
	// undecodable audio codec — Dolby Digital / DTS / Atmos). Chrome exposes
	// decoded-byte counters; if video is advancing and audio isn't after a few
	// seconds of playback, flag it. Non-fatal: the video keeps playing.
	let audioUnavailable = $state(false);
	$effect(() => {
		// Re-arm whenever the source changes.
		void src;
		audioUnavailable = false;
		if (!video) {
			return;
		}
		const el = video as HTMLVideoElement & {
			webkitAudioDecodedByteCount?: number;
			webkitVideoDecodedByteCount?: number;
		};
		const haveCounters = el.webkitVideoDecodedByteCount !== undefined;
		if (!haveCounters && !audioRisky) {
			return; // no counters (not Chromium) and no label hint — can't tell
		}
		const needed = audioRisky ? 2 : 3;
		let silentTicks = 0;
		let playedSeconds = 0;
		const timer = setInterval(() => {
			if (fatalError || el.paused || el.currentTime < 3) {
				return;
			}
			playedSeconds += 1;
			if (haveCounters) {
				const videoMoving = (el.webkitVideoDecodedByteCount ?? 0) > 0;
				const audioMoving = (el.webkitAudioDecodedByteCount ?? 0) > 0;
				if (videoMoving && !audioMoving) {
					silentTicks += 1;
				} else {
					silentTicks = 0;
				}
				if (silentTicks >= needed) {
					audioUnavailable = true;
					clearInterval(timer);
				}
			} else if (audioRisky && playedSeconds >= 6) {
				// No counters, but the label warned us and it has been playing a
				// while — surface the (dismissible) hint.
				audioUnavailable = true;
				clearInterval(timer);
			}
		}, 1000);
		return () => clearInterval(timer);
	});

	function onEndedInternal() {
		ended = true;
		onEnded?.();
	}

	function togglePlay() {
		if (!video) {
			return;
		}
		if (video.ended) {
			video.currentTime = 0;
			void video.play();
		} else if (video.paused) {
			void video.play();
		} else {
			video.pause();
		}
	}

	function seek(delta: number) {
		if (!video) {
			return;
		}
		const upper = Number.isFinite(video.duration)
			? video.duration
			: Number.POSITIVE_INFINITY;
		video.currentTime = Math.min(Math.max(0, video.currentTime + delta), upper);
	}

	function seekToRatio(ratio: number) {
		if (video && duration > 0) {
			video.currentTime = Math.min(Math.max(0, ratio), 1) * duration;
		}
	}

	function onScrub(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (video) {
			video.currentTime = value;
		}
	}

	function onScrubHover(event: PointerEvent) {
		if (!scrubTrack) {
			return;
		}
		const rect = scrubTrack.getBoundingClientRect();
		hoverRatio = Math.min(
			1,
			Math.max(0, (event.clientX - rect.left) / rect.width),
		);
	}

	function adjustVolume(delta: number) {
		volume = Math.min(1, Math.max(0, Number((volume + delta).toFixed(2))));
		muted = volume === 0;
	}

	async function toggleFullscreen() {
		if (!container) {
			return;
		}
		if (document.fullscreenElement) {
			await document.exitFullscreen();
		} else {
			await container.requestFullscreen();
		}
	}

	async function togglePip() {
		if (!video) {
			return;
		}
		if (document.pictureInPictureElement) {
			await document.exitPictureInPicture();
		} else if (document.pictureInPictureEnabled) {
			await video.requestPictureInPicture();
		}
	}

	function setCaption(key: string | null) {
		if (!video) {
			return;
		}
		for (const track of Array.from(video.textTracks)) {
			track.mode = track.label === key ? "showing" : "disabled";
		}
		activeCaption = key;
		// A fresh track starts at its natural timing.
		subtitleOffset = 0;
	}

	function nudgeSubtitleOffset(delta: number) {
		if (!video) {
			return;
		}
		subtitleOffset = Math.round((subtitleOffset + delta) * 10) / 10;
		for (const track of Array.from(video.textTracks)) {
			if (track.mode !== "showing" || !track.cues) {
				continue;
			}
			for (const cue of Array.from(track.cues)) {
				cue.startTime = Math.max(0, cue.startTime + delta);
				cue.endTime = Math.max(0, cue.endTime + delta);
			}
		}
	}

	function setAudioTrack(id: number) {
		if (hls) {
			hls.audioTrack = id;
			activeAudioTrack = id;
		}
		settingsOpen = false;
	}

	function cycleCaption() {
		if (options.length === 0) {
			return;
		}
		const keys = [null, ...options.map((entry) => entry.key)];
		const index = keys.indexOf(activeCaption);
		setCaption(keys[(index + 1) % keys.length]);
	}

	function applyAppearance(patch: SubtitleAppearance) {
		onSubtitleAppearance?.(patch);
	}

	function nudgeControls() {
		controlsVisible = true;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			if (!paused && !menuOpen) {
				controlsVisible = false;
			}
		}, 3000);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.target instanceof HTMLInputElement) {
			return;
		}
		switch (event.key) {
			case " ":
			case "k":
				event.preventDefault();
				togglePlay();
				break;
			case "ArrowLeft":
			case "j":
				seek(-10);
				break;
			case "ArrowRight":
			case "l":
				seek(10);
				break;
			case "ArrowUp":
				adjustVolume(0.1);
				break;
			case "ArrowDown":
				adjustVolume(-0.1);
				break;
			case "f":
				void toggleFullscreen();
				break;
			case "m":
				muted = !muted;
				break;
			case "c":
				cycleCaption();
				break;
			case "n":
				onNext?.();
				break;
			case "e":
				onEpisodes?.();
				break;
			case "Escape":
				if (menuOpen) {
					settingsOpen = false;
					subtitlesOpen = false;
				}
				break;
			default:
				return;
		}
		nudgeControls();
	}

	function fmt(seconds: number): string {
		if (!Number.isFinite(seconds)) {
			return "0:00";
		}
		const total = Math.floor(seconds);
		const h = Math.floor(total / 3600);
		const m = Math.floor((total % 3600) / 60);
		const s = total % 60;
		return h > 0
			? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
			: `${m}:${String(s).padStart(2, "0")}`;
	}
</script>

<svelte:document
	onfullscreenchange={() => (fullscreen = Boolean(document.fullscreenElement))}
/>
<svelte:window onkeydown={onKeydown} />

<div
	bind:this={container}
	role="region"
	aria-label="Video player"
	class={cn(
		"nuvio-player group/player relative w-full overflow-hidden bg-black select-none",
		fill ? "h-full" : "aspect-video rounded-lg",
	)}
	class:cursor-none={!controlsVisible}
	style:--cue-size={cueFontSize}
	style:--cue-color={subtitleColor}
	style:--cue-bg={cueBackground}
	onmousemove={nudgeControls}
	onmouseleave={() => !paused && !menuOpen && (controlsVisible = false)}
>
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		bind:this={video}
		bind:paused
		bind:currentTime
		bind:duration
		bind:volume
		bind:muted
		bind:buffered
		autoplay
		class="size-full object-contain"
		playsinline
		onloadedmetadata={onLoadedMetadata}
		onloadeddata={onReady}
		oncanplay={onReady}
		onplaying={onReady}
		onwaiting={onWaiting}
		onerror={onMediaError}
		onclick={togglePlay}
		onended={onEndedInternal}
	>
		{#each options as track (track.key)}
			<track
				kind="subtitles"
				srclang={track.lang}
				label={track.key}
				src={`/api/subtitle?url=${encodeURIComponent(track.url)}`}
			/>
		{/each}
	</video>

	{#if loading && !fatalError}
		<PlaybackLoading
			backdrop={poster}
			{logo}
			{title}
			{certification}
			{genres}
			label="Loading stream…"
		/>
	{/if}

	{#if audioUnavailable && !fatalError}
		<div
			class="absolute inset-x-0 top-0 z-20 flex items-start gap-3 bg-amber-500/95 px-4 py-2.5 text-sm text-black"
		>
			<Volume2Icon class="mt-0.5 size-4 shrink-0" />
			<p class="flex-1">
				This source is playing without sound. Its audio codec (Dolby Digital,
				DTS or Atmos) isn't supported by the browser.
			</p>
			{#if onSources}
				<button
					type="button"
					onclick={onSources}
					class="shrink-0 rounded-md bg-black/85 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-black"
				>
					Other sources
				</button>
			{/if}
			<button
				type="button"
				aria-label="Dismiss"
				onclick={() => (audioUnavailable = false)}
				class="shrink-0 rounded-md p-1 transition hover:bg-black/10"
			>
				<XIcon class="size-4" />
			</button>
		</div>
	{/if}

	{#if fatalError}
		<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center text-white">
			<p class="max-w-sm text-sm text-white/80">{fatalError}</p>
			<div class="flex flex-wrap items-center justify-center gap-2">
				{#if onSources}
					<button
						type="button"
						onclick={onSources}
						class="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black transition hover:bg-white/90"
					>
						<LayersIcon class="size-4" /> Choose another source
					</button>
				{/if}
				{#if onBack}
					<button
						type="button"
						onclick={onBack}
						class="rounded-md bg-white/15 px-3 py-1.5 text-sm transition hover:bg-white/25"
					>
						Back
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<div
		class={cn(
			"absolute inset-0 flex flex-col justify-between bg-linear-to-t from-black/80 via-black/10 to-black/60 transition-opacity duration-200",
			controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
		)}
	>
		<!-- Top row -->
		<div class="flex items-start gap-3 p-3 text-white sm:p-4">
			{#if onBack}
				<button
					type="button"
					aria-label="Back"
					onclick={onBack}
					class="flex size-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white/15"
				>
					<ArrowLeftIcon class="size-5" />
				</button>
			{/if}
			<div class="min-w-0 flex-1 pt-1">
				<p class="truncate font-semibold">{title}</p>
				{#if subheading}
					<p class="truncate text-sm text-white/70">{subheading}</p>
				{/if}
			</div>
			{#if onSources}
				<button
					type="button"
					onclick={onSources}
					class="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition hover:bg-white/20"
				>
					<LayersIcon class="size-4" /> Sources
				</button>
			{/if}
		</div>

		<!-- Centre transport cluster -->
		{#if !loading && !fatalError}
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center gap-6 sm:gap-10">
				<button
					type="button"
					aria-label="Back 10 seconds"
					onclick={() => seek(-10)}
					class="pointer-events-auto flex size-11 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white"
				>
					<RotateCcwIcon class="size-6" />
				</button>
				<button
					type="button"
					aria-label={ended ? "Replay" : paused ? "Play" : "Pause"}
					onclick={togglePlay}
					class="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:scale-105 hover:bg-white/25 sm:size-20"
				>
					{#if ended}
						<RotateCwIcon class="size-8 sm:size-9" />
					{:else if paused}
						<PlayIcon class="size-8 fill-current sm:size-9" />
					{:else}
						<PauseIcon class="size-8 fill-current sm:size-9" />
					{/if}
				</button>
				<button
					type="button"
					aria-label="Forward 10 seconds"
					onclick={() => seek(10)}
					class="pointer-events-auto flex size-11 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white"
				>
					<RotateCwIcon class="size-6" />
				</button>
			</div>
		{/if}

		<!-- Bottom bar -->
		<div class="flex flex-col gap-2 px-3 pb-3 text-white sm:px-4 sm:pb-4">
			<!-- Scrubber -->
			<div
				bind:this={scrubTrack}
				role="presentation"
				class="group/scrub relative flex h-5 items-center"
				onpointermove={onScrubHover}
				onpointerleave={() => (hoverRatio = null)}
			>
				<div class="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-white/25 transition-all group-hover/scrub:h-1.5"></div>
				<div
					class="pointer-events-none absolute h-1 rounded-full bg-white/40 transition-all group-hover/scrub:h-1.5"
					style={`width: ${bufferedRatio * 100}%`}
				></div>
				{#if hoverRatio !== null}
					<div
						class="pointer-events-none absolute h-1 rounded-full bg-white/40 transition-all group-hover/scrub:h-1.5"
						style={`width: ${hoverRatio * 100}%`}
					></div>
					<div
						class="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-black/85 px-1.5 py-0.5 text-[11px] tabular-nums"
						style={`left: ${hoverRatio * 100}%`}
					>
						{fmt(hoverRatio * duration)}
					</div>
				{/if}
				<div
					class="pointer-events-none absolute h-1 rounded-full bg-primary transition-all group-hover/scrub:h-1.5"
					style={`width: ${progressRatio * 100}%`}
				></div>
				<div
					class="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover/scrub:opacity-100"
					style={`left: ${progressRatio * 100}%`}
				></div>
				<input
					type="range"
					min="0"
					max={duration || 0}
					step="0.1"
					value={currentTime}
					aria-label="Seek"
					oninput={onScrub}
					class="relative h-5 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent"
				/>
			</div>

			<div class="flex items-center gap-2 sm:gap-3">
				<button
					type="button"
					aria-label={ended ? "Replay" : paused ? "Play" : "Pause"}
					onclick={togglePlay}
					class="flex size-9 items-center justify-center rounded-full transition hover:bg-white/15"
				>
					{#if ended}
						<RotateCwIcon class="size-5" />
					{:else if paused}
						<PlayIcon class="size-5 fill-current" />
					{:else}
						<PauseIcon class="size-5 fill-current" />
					{/if}
				</button>

				<div class="flex items-center gap-1.5">
					<button
						type="button"
						aria-label={muted ? "Unmute" : "Mute"}
						onclick={() => (muted = !muted)}
						class="flex size-9 items-center justify-center rounded-full transition hover:bg-white/15"
					>
						{#if muted || volume === 0}
							<VolumeXIcon class="size-5" />
						{:else if volume < 0.5}
							<Volume1Icon class="size-5" />
						{:else}
							<Volume2Icon class="size-5" />
						{/if}
					</button>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						bind:value={volume}
						aria-label="Volume"
						class="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/30 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
					/>
				</div>

				<span class="ml-1 text-xs tabular-nums text-white/80">
					{fmt(currentTime)} <span class="text-white/40">/ {fmt(duration)}</span>
				</span>

				<div class="ml-auto flex items-center gap-1 sm:gap-2">
					{#if onNext}
						<button
							type="button"
							aria-label="Next episode"
							onclick={onNext}
							class="flex size-9 items-center justify-center rounded-full transition hover:bg-white/15"
						>
							<SkipForwardIcon class="size-5" />
						</button>
					{/if}
					{#if onEpisodes}
						<button
							type="button"
							aria-label="Episodes"
							onclick={onEpisodes}
							class="flex size-9 items-center justify-center rounded-full transition hover:bg-white/15"
						>
							<ListVideoIcon class="size-5" />
						</button>
					{/if}
					{#if options.length > 0}
						<button
							type="button"
							aria-label="Subtitles"
							aria-pressed={subtitlesOpen}
							onclick={() => {
								subtitlesOpen = !subtitlesOpen;
								settingsOpen = false;
							}}
							class={cn(
								"flex size-9 items-center justify-center rounded-full transition hover:bg-white/15",
								activeCaption && "text-primary",
							)}
						>
							{#if activeCaption}
								<CaptionsIcon class="size-5" />
							{:else}
								<CaptionsOffIcon class="size-5" />
							{/if}
						</button>
					{/if}

					<div class="relative">
						<button
							type="button"
							aria-label="Settings"
							aria-pressed={settingsOpen}
							onclick={() => {
								settingsOpen = !settingsOpen;
								subtitlesOpen = false;
							}}
							class="flex size-9 items-center justify-center rounded-full transition hover:bg-white/15"
						>
							<SettingsIcon class="size-5" />
						</button>
						{#if settingsOpen}
							<div
								class="absolute right-0 bottom-11 max-h-[70vh] w-44 overflow-y-auto rounded-lg border border-white/15 bg-black/90 p-1.5 text-sm backdrop-blur-md scrollbar-thin"
							>
								<p class="px-2 py-1 text-xs font-medium text-white/50">Playback speed</p>
								{#each rates as option (option)}
									<button
										type="button"
										onclick={() => {
											rate = option;
											settingsOpen = false;
										}}
										class={cn(
											"flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition hover:bg-white/10",
											rate === option && "text-primary",
										)}
									>
										{option === 1 ? "Normal" : `${option}×`}
										{#if rate === option}<CheckIcon class="size-3.5" />{/if}
									</button>
								{/each}
								{#if audioTracks.length > 1}
									<p class="mt-1 px-2 py-1 text-xs font-medium text-white/50">Audio</p>
									{#each audioTracks as track (track.id)}
										<button
											type="button"
											onclick={() => setAudioTrack(track.id)}
											class={cn(
												"flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition hover:bg-white/10",
												activeAudioTrack === track.id && "text-primary",
											)}
										>
											<span class="truncate">{track.label}</span>
											{#if activeAudioTrack === track.id}<CheckIcon class="size-3.5 shrink-0" />{/if}
										</button>
									{/each}
								{/if}
							</div>
						{/if}
					</div>

					{#if typeof document !== "undefined" && document.pictureInPictureEnabled}
						<button
							type="button"
							aria-label="Picture in picture"
							onclick={togglePip}
							class="flex size-9 items-center justify-center rounded-full transition hover:bg-white/15"
						>
							<PictureInPictureIcon class="size-5" />
						</button>
					{/if}

					<button
						type="button"
						aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
						onclick={toggleFullscreen}
						class="flex size-9 items-center justify-center rounded-full transition hover:bg-white/15"
					>
						{#if fullscreen}<MinimizeIcon class="size-5" />{:else}<MaximizeIcon class="size-5" />{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- Subtitle overlay -->
		{#if subtitlesOpen}
			<div
				class="absolute inset-y-0 right-0 flex w-full max-w-90 flex-col border-l border-white/10 bg-black/85 text-white backdrop-blur-md"
			>
				<div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
					<p class="text-sm font-semibold">Subtitles</p>
					<button
						type="button"
						aria-label="Close subtitles"
						onclick={() => (subtitlesOpen = false)}
						class="flex size-8 items-center justify-center rounded-full transition hover:bg-white/15"
					>
						<XIcon class="size-4" />
					</button>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
					<button
						type="button"
						onclick={() => setCaption(null)}
						class={cn(
							"flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-white/10",
							!activeCaption && "text-primary",
						)}
					>
						<CheckIcon class={cn("size-4 shrink-0", activeCaption && "invisible")} />
						Off
					</button>
					{#each options as option (option.key)}
						<button
							type="button"
							onclick={() => setCaption(option.key)}
							class={cn(
								"flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition hover:bg-white/10",
								activeCaption === option.key && "text-primary",
							)}
						>
							<CheckIcon
								class={cn(
									"mt-0.5 size-4 shrink-0",
									activeCaption !== option.key && "invisible",
								)}
							/>
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-1.5">
									{option.name}
									{#if option.sdh}
										<span class="rounded bg-white/15 px-1 text-[10px] font-medium tracking-wide">SDH</span>
									{/if}
								</span>
								{#if option.addonName}
									<span class="block truncate text-xs text-white/50">{option.addonName}</span>
								{/if}
							</span>
						</button>
					{/each}
				</div>

				<div class="space-y-3 border-t border-white/10 p-4">
					<p class="text-xs font-medium text-white/50">Appearance</p>
					<div class="flex gap-1.5">
						{#each SUBTITLE_SIZES as size (size)}
							<button
								type="button"
								onclick={() => applyAppearance({ subtitleSize: size })}
								class={cn(
									"flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition",
									subtitleSize === size
										? "border-primary bg-primary/15 text-primary"
										: "border-white/15 text-white/70 hover:bg-white/10",
								)}
							>
								{sizeLabels[size]}
							</button>
						{/each}
					</div>
					<div class="flex items-center gap-2">
						{#each swatches as swatch (swatch)}
							<button
								type="button"
								aria-label={`Subtitle colour ${swatch}`}
								onclick={() => applyAppearance({ subtitleColor: swatch })}
								class={cn(
									"size-6 rounded-full ring-2 transition",
									subtitleColor === swatch ? "ring-primary" : "ring-white/20",
								)}
								style={`background-color: ${swatch}`}
							></button>
						{/each}
					</div>
					<button
						type="button"
						onclick={() =>
							applyAppearance({ subtitleBackground: !subtitleBackground })}
						class="flex w-full items-center justify-between rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10"
					>
						Background plate
						<span
							class={cn(
								"rounded-full px-2 py-0.5 text-[10px]",
								subtitleBackground
									? "bg-primary/20 text-primary"
									: "bg-white/10 text-white/50",
							)}
						>
							{subtitleBackground ? "On" : "Off"}
						</span>
					</button>

					{#if activeCaption}
						<div class="flex items-center justify-between gap-2 rounded-md border border-white/15 px-3 py-2 text-xs font-medium text-white/80">
							<span>Timing</span>
							<div class="flex items-center gap-2">
								<button
									type="button"
									aria-label="Subtitles earlier"
									onclick={() => nudgeSubtitleOffset(-0.5)}
									class="flex size-6 items-center justify-center rounded bg-white/10 transition hover:bg-white/20"
								>
									−
								</button>
								<span class="w-12 text-center tabular-nums">
									{subtitleOffset > 0 ? "+" : ""}{subtitleOffset.toFixed(1)}s
								</span>
								<button
									type="button"
									aria-label="Subtitles later"
									onclick={() => nudgeSubtitleOffset(0.5)}
									class="flex size-6 items-center justify-center rounded bg-white/10 transition hover:bg-white/20"
								>
									+
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* `::cue` only honours a small set of properties; size / colour / plate are it. */
	:global(.nuvio-player video::cue) {
		font-size: var(--cue-size);
		color: var(--cue-color);
		background-color: var(--cue-bg);
		line-height: 1.3;
	}
</style>
