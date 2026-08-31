<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CaptionsIcon from "@lucide/svelte/icons/captions";
	import CaptionsOffIcon from "@lucide/svelte/icons/captions-off";
	import CheckIcon from "@lucide/svelte/icons/check";
	import InfoIcon from "@lucide/svelte/icons/info";
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
	import PlaybackLoading from "#lib/components/playback-loading.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import {
		SUBTITLE_SIZES,
		type SubtitleSize,
		subtitleFontSize,
	} from "#lib/settings/ui-settings.js";
	import { cn } from "#lib/utils.js";
	import {
		formatTime,
		languageMatches,
		languageName,
	} from "#lib/watch/player-format.js";
	import type { PlayerInfo } from "#lib/watch/player-info.js";
	import PlayerInfoOverlay from "#lib/watch/player-info-overlay.svelte";
	import { handlePlayerKey } from "#lib/watch/player-keymap.js";
	import { createPlayerMedia } from "#lib/watch/player-media.svelte.js";
	import { createProgressReporter } from "#lib/watch/player-progress.svelte.js";
	import { createSilentAudioWatch } from "#lib/watch/silent-audio.svelte.js";

	interface SubtitleTrack {
		id?: string;
		lang: string;
		url: string;
		addonName?: string;
		sdh?: boolean;
	}

	interface SubtitleAppearance {
		subtitleSize?: SubtitleSize;
		subtitleColor?: string;
		subtitleBackground?: boolean;
	}

	let {
		src,
		poster = null,
		posterImage = null,
		logo = null,
		title,
		subheading = null,
		startTime = 0,
		subtitles = [],
		fill = false,
		certification = null,
		genres = [],
		info = null,
		detailHref = "",
		subtitleSize = "medium",
		subtitleColor = "#ffffff",
		subtitleBackground = true,
		preferredLanguage = "",
		audioRisky = false,
		introStart = null,
		introEnd = null,
		outroStart = null,
		minimized = false,
		onProgress,
		onEnded,
		onOutro,
		onBack,
		onSources,
		onSubtitleAppearance,
		onEpisodes,
		onNext,
	}: {
		src: string;
		/** Backdrop image — loading treatment, `<video poster>`, info-overlay bed. */
		poster?: string | null;
		/** 2:3 poster shown in the info overlay. */
		posterImage?: string | null;
		logo?: string | null;
		title: string;
		subheading?: string | null;
		startTime?: number;
		subtitles?: SubtitleTrack[];
		/** Fill the parent instead of holding a 16:9 box (full-page player). */
		fill?: boolean;
		certification?: string | null;
		genres?: string[];
		/** Meta for the in-player info overlay (Info button + auto-on-pause). */
		info?: PlayerInfo | null;
		/** Link to the full detail page, from inside the info overlay. */
		detailHref?: string;
		subtitleSize?: SubtitleSize;
		subtitleColor?: string;
		subtitleBackground?: boolean;
		preferredLanguage?: string;
		/** The stream label hints at an audio codec the browser can't decode. */
		audioRisky?: boolean;
		/** Intro window in seconds (from TheIntroDB) — drives "Skip intro". */
		introStart?: number | null;
		introEnd?: number | null;
		/** Seconds at which the end credits start — drives the outro handoff. */
		outroStart?: number | null;
		/** Shrink to a corner PiP (the page's end-of-show takeover). */
		minimized?: boolean;
		onProgress?: (position: number, duration: number) => void;
		onEnded?: () => void;
		/** Fired once when playback first reaches `outroStart`. */
		onOutro?: () => void;
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
	// The in-player info overlay. `infoAutoOpened` = surfaced by a pause (closes
	// itself on resume); a click on the Info button opens it "sticky".
	let infoOpen = $state(false);
	let infoAutoOpened = $state(false);
	let activeCaption = $state<string | null>(null);
	let seeded = false;
	// One silent reload is attempted on a recoverable media error before we
	// surface a fatal screen; reset whenever the source changes.
	let recoveryAttempted = false;
	// `onOutro` fires once per source.
	let outroFired = false;

	// Subtitle timing nudge (seconds), applied as a delta to the showing track's
	// cues. Resets when the track changes.
	let subtitleOffset = $state(0);

	// Hover-scrub preview.
	let scrubTrack = $state<HTMLDivElement | null>(null);
	let hoverRatio = $state<number | null>(null);

	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	// New source: clear everything scoped to the previous stream.
	function resetForNewSource() {
		fatalError = null;
		recoveryAttempted = false;
		outroFired = false;
		seeded = false;
		loading = true;
		ended = false;
		autoSubDone = false;
		subtitleOffset = 0;
		infoOpen = false;
		infoAutoOpened = false;
		infoDismissed = false;
		progress.reset();
	}

	const media = createPlayerMedia({
		src: () => src,
		video: () => video,
		onLoad: resetForNewSource,
		onFatal: (message) => {
			fatalError = message;
		},
	});

	const progress = createProgressReporter({
		video: () => video,
		duration: () => duration,
		currentTime: () => currentTime,
		onProgress: (position, total) => onProgress?.(position, total),
	});

	const silentAudio = createSilentAudioWatch({
		src: () => src,
		video: () => video,
		hls: () => media.hls,
		audioRisky: () => audioRisky,
		blocked: () => Boolean(fatalError),
		onTrackSwitch: (index) => {
			media.activeAudioTrack = index;
		},
	});

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

	// "Skip intro" — visible while playback sits inside the intro window.
	const showSkipIntro = $derived(
		introEnd != null &&
			!minimized &&
			!fatalError &&
			currentTime >= (introStart ?? 0) &&
			currentTime < introEnd - 1,
	);

	function skipIntro() {
		if (video && introEnd != null) {
			video.currentTime = introEnd;
			void video.play();
		}
	}

	// Fire `onOutro` once as playback crosses into the credits.
	$effect(() => {
		if (
			!outroFired &&
			outroStart != null &&
			duration > 0 &&
			currentTime >= outroStart &&
			currentTime < duration - 0.5
		) {
			outroFired = true;
			onOutro?.();
		}
	});

	// Set once the viewer dismisses the info overlay during a pause — stops the
	// auto-open effect from immediately surfacing it again. Cleared on resume.
	let infoDismissed = false;

	function openInfo() {
		infoAutoOpened = false;
		infoOpen = true;
		settingsOpen = false;
		subtitlesOpen = false;
		controlsVisible = true;
	}

	function closeInfo() {
		infoOpen = false;
		infoAutoOpened = false;
		if (paused) {
			infoDismissed = true;
		}
	}

	function toggleInfo() {
		if (infoOpen) {
			closeInfo();
		} else {
			openInfo();
		}
	}

	// Surface the info overlay on a deliberate pause (not a buffering stall, not
	// the end of playback), and pull it back down the moment playback resumes.
	$effect(() => {
		if (!info || minimized || fatalError || ended || loading) {
			return;
		}
		if (!paused) {
			infoDismissed = false;
			if (infoAutoOpened) {
				infoOpen = false;
				infoAutoOpened = false;
			}
			return;
		}
		if (infoOpen || infoDismissed || currentTime < 1) {
			return;
		}
		const timer = setTimeout(() => {
			infoAutoOpened = true;
			infoOpen = true;
			controlsVisible = true;
		}, 700);
		return () => clearTimeout(timer);
	});

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
			name: languageName(track.lang),
		})),
	);
	const menuOpen = $derived(settingsOpen || subtitlesOpen);
	// Any open side panel keeps the transport controls (and the Back button) up,
	// so a panel is never a dead end.
	const panelOpen = $derived(menuOpen || infoOpen);

	let autoSubDone = false;

	$effect(() => {
		if (video) {
			video.playbackRate = rate;
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
				languageMatches(entry.lang, preferredLanguage),
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
			void video.play().catch(() => undefined);
			return;
		}

		fatalError = "This source stopped playing and couldn't be recovered.";
		loading = false;
	}

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
		media.selectAudioTrack(id);
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
			if (!(paused || panelOpen)) {
				controlsVisible = false;
			}
		}, 3000);
	}

	function onKeydown(event: KeyboardEvent) {
		const handled = handlePlayerKey(event, {
			togglePlay,
			seek,
			adjustVolume,
			toggleFullscreen: () => void toggleFullscreen(),
			toggleMute: () => (muted = !muted),
			cycleCaption,
			toggleInfo: () => {
				if (info) {
					toggleInfo();
				}
			},
			next: () => onNext?.(),
			episodes: () => onEpisodes?.(),
			closeMenus: () => {
				settingsOpen = false;
				subtitlesOpen = false;
			},
		});
		if (handled) {
			nudgeControls();
		}
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
	data-accent={theme.current.accent}
	data-amoled={theme.current.darkStyle === "amoled"}
	class={cn(
		"nuvio-player dark group/player overflow-hidden bg-black text-foreground select-none transition-all duration-500 ease-out",
		minimized
			? "fixed right-4 bottom-4 z-40 aspect-video w-56 rounded-xl shadow-2xl ring-1 ring-white/15 sm:w-72"
			: fill
				? "relative h-full w-full"
				: "relative aspect-video w-full rounded-lg",
	)}
	class:cursor-none={!controlsVisible && !minimized}
	style:--cue-size={cueFontSize}
	style:--cue-color={subtitleColor}
	style:--cue-bg={cueBackground}
	onmousemove={nudgeControls}
	onmouseleave={() => !paused && !panelOpen && (controlsVisible = false)}
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
		onpause={progress.flush}
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

	{#if silentAudio.issue && !fatalError && !minimized}
		<div
			class="absolute inset-x-0 bottom-30 z-90 flex  gap-3 bg-black/75 mx-10 rounded-xl items-center justify-between px-4 py-2.5 text-sm text-white border-primary border-2"
		>
			<div class="flex items-center gap-2">
				<VolumeXIcon class="mt-0.5 size-5 shrink-0" />
				<div>
					<p class="text-md font-medium">
					Uh oh...
				</p>
				<p class="flex-1">
					{#if silentAudio.issue === "no-track"}
						This source has no audio.
					{:else}
						This source is playing without sound. Its audio codec (Dolby Digital,
						DTS or Atmos) isn't supported by the browser.
					{/if}
				</p>
			</div>
			</div>
			<div class="flex items-center gap-2">
				{#if onSources}
					<Button
						size="xs"
						onclick={onSources}
					>
						Other sources
					</Button>
				{/if}
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Dismiss"
					onclick={() => silentAudio.dismiss()}
					class="shrink-0 text-white hover:bg-black/10"
				>
					<XIcon class="size-4" />
				</Button>
			</div>
		</div>
	{/if}

	{#if fatalError}
		<div class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center">
			<p class="max-w-sm text-sm text-muted-foreground">{fatalError}</p>
			<div class="flex flex-wrap items-center justify-center gap-2">
				{#if onSources}
					<Button onclick={onSources}>
						<LayersIcon data-icon="inline-start" /> Choose another source
					</Button>
				{/if}
				{#if onBack}
					<Button variant="secondary" onclick={onBack}>Back</Button>
				{/if}
			</div>
		</div>
	{/if}

	{#if showSkipIntro}
		<Button
			onclick={skipIntro}
			class="absolute right-4 bottom-20 z-20 shadow-lg sm:right-6 sm:bottom-24"
		>
			Skip intro
		</Button>
	{/if}

	{#if infoOpen && info && !minimized}
		<PlayerInfoOverlay
			{title}
			{subheading}
			{logo}
			background={poster}
			poster={posterImage}
			{certification}
			{genres}
			{info}
			{detailHref}
			autoOpened={infoAutoOpened}
			onResume={() => {
				closeInfo();
				void video?.play();
			}}
			onClose={closeInfo}
		/>
	{/if}

	<!-- Transport controls. The container is click-transparent so the info
	     overlay behind it stays interactive; each bar re-enables pointer events. -->
	<div
		class={cn(
			"pointer-events-none absolute inset-0 z-30 flex flex-col justify-between bg-linear-to-t from-black/80 via-black/10 to-black/60 transition-opacity duration-200",
			minimized || !controlsVisible ? "opacity-0" : "opacity-100",
		)}
	>
		<!-- Top row -->
		<div class="pointer-events-auto flex items-start gap-3 p-3 sm:p-4">
			{#if onBack}
				<Button
					variant="ghost"
					size="icon"
					aria-label="Back"
					onclick={onBack}
					class="shrink-0 rounded-full"
				>
					<ArrowLeftIcon class="size-5" />
				</Button>
			{/if}
			<div class="min-w-0 flex-1 pt-1">
				<p class="truncate font-semibold">{title}</p>
				{#if subheading}
					<p class="truncate text-sm text-muted-foreground">{subheading}</p>
				{/if}
			</div>
			{#if info}
				<Button
					variant={infoOpen ? "default" : "secondary"}
					size="sm"
					aria-pressed={infoOpen}
					onclick={toggleInfo}
					class="shrink-0 gap-1.5 rounded-full font-medium [&_svg]:size-3.5"
				>
					<InfoIcon data-icon="inline-start" />Info
				</Button>
			{/if}
			{#if onSources}
				<Button
					variant="secondary"
					size="sm"
					onclick={onSources}
					class="shrink-0 gap-1.5 rounded-full font-medium [&_svg]:size-3.5"
				>
					<LayersIcon data-icon="inline-start" />Sources
				</Button>
			{/if}
		</div>

		<!-- Centre transport cluster — hidden while the info overlay owns the frame. -->
		{#if !loading && !fatalError && !infoOpen}
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center gap-8 sm:gap-12">
				<Button
					variant="ghost"
					aria-label="Back 10 seconds"
					onclick={() => seek(-10)}
					class="pointer-events-auto size-14 rounded-full [&_svg]:size-10"
				>
					<RotateCcwIcon />
				</Button>
				<Button
					variant="ghost"
					aria-label={ended ? "Replay" : paused ? "Play" : "Pause"}
					onclick={togglePlay}
					class="pointer-events-auto size-16 rounded-full bg-white/10 shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-white/20 sm:size-18 [&_svg]:size-12 sm:[&_svg]:size-14"
				>
					{#if ended}
						<RotateCwIcon />
					{:else if paused}
						<PlayIcon class="fill-current" />
					{:else}
						<PauseIcon class="fill-current" />
					{/if}
				</Button>
				<Button
					variant="ghost"
					aria-label="Forward 10 seconds"
					onclick={() => seek(10)}
					class="pointer-events-auto size-14 rounded-full [&_svg]:size-10"
				>
					<RotateCwIcon />
				</Button>
			</div>
		{/if}

		<!-- Bottom bar -->
		<div class="pointer-events-auto flex flex-col gap-2 px-3 pb-3 text-white sm:px-4 sm:pb-4">
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
						{formatTime(hoverRatio * duration)}
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
				<Button
					variant="ghost"
					size="icon"
					aria-label={ended ? "Replay" : paused ? "Play" : "Pause"}
					onclick={togglePlay}
					class="rounded-full [&_svg]:size-5"
				>
					{#if ended}
						<RotateCwIcon />
					{:else if paused}
						<PlayIcon class="fill-current " /> 
					{:else}
						<PauseIcon class="fill-current" />
					{/if}
				</Button>

				<div class="flex items-center gap-1.5">
					<Button
						variant="ghost"
						size="icon"
						aria-label={muted ? "Unmute" : "Mute"}
						onclick={() => (muted = !muted)}
						class="rounded-full [&_svg]:size-5"
					>
						{#if muted || volume === 0}
							<VolumeXIcon />
						{:else if volume < 0.5}
							<Volume1Icon />
						{:else}
							<Volume2Icon />
						{/if}
					</Button>
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

				<span class="ml-1 text-xs tabular-nums text-muted-foreground">
					{formatTime(currentTime)}
					<span class="text-muted-foreground/60">/ {formatTime(duration)}</span>
				</span>

				<div class="ml-auto flex items-center gap-1 sm:gap-2">
					{#if onNext}
						<Button
							variant="ghost"
							size="icon"
							aria-label="Next episode"
							onclick={onNext}
							class="rounded-full [&_svg]:size-5"
						>
							<SkipForwardIcon />
						</Button>
					{/if}
					{#if onEpisodes}
						<Button
							variant="ghost"
							size="icon"
							aria-label="Episodes"
							onclick={onEpisodes}
							class="rounded-full [&_svg]:size-5"
						>
							<ListVideoIcon />
						</Button>
					{/if}
					{#if options.length > 0}
						<Button
							variant="ghost"
							size="icon"
							aria-label="Subtitles"
							aria-pressed={subtitlesOpen}
							onclick={() => {
								subtitlesOpen = !subtitlesOpen;
								settingsOpen = false;
								infoOpen = false;
							}}
							class={cn("rounded-full [&_svg]:size-5", activeCaption && "text-primary")}
						>
							{#if activeCaption}
								<CaptionsIcon />
							{:else}
								<CaptionsOffIcon />
							{/if}
						</Button>
					{/if}

					<div class="relative">
						<Button
							variant="ghost"
							size="icon"
							aria-label="Settings"
							aria-pressed={settingsOpen}
							onclick={() => {
								settingsOpen = !settingsOpen;
								subtitlesOpen = false;
								infoOpen = false;
							}}
							class="rounded-full [&_svg]:size-5"
						>
							<SettingsIcon />
						</Button>
						{#if settingsOpen}
							<div
								class="absolute right-0 bottom-11 max-h-[70vh] w-44 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-md backdrop-blur-md scrollbar-thin"
							>
								<p class="px-2 py-1 text-xs font-medium text-muted-foreground">Playback speed</p>
								{#each rates as option (option)}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => {
											rate = option;
											settingsOpen = false;
										}}
										class={cn(
											"w-full justify-between",
											rate === option && "text-primary",
										)}
									>
										{option === 1 ? "Normal" : `${option}×`}
										{#if rate === option}<CheckIcon class="size-3.5" />{/if}
									</Button>
								{/each}
								{#if media.audioTracks.length > 1}
									<p class="mt-1 px-2 py-1 text-xs font-medium text-muted-foreground">Audio</p>
									{#each media.audioTracks as track (track.id)}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => setAudioTrack(track.id)}
											class={cn(
												"w-full justify-between",
												media.activeAudioTrack === track.id && "text-primary",
											)}
										>
											<span class="truncate">{track.label}</span>
											{#if media.activeAudioTrack === track.id}<CheckIcon class="size-3.5 shrink-0" />{/if}
										</Button>
									{/each}
								{/if}
							</div>
						{/if}
					</div>

					{#if typeof document !== "undefined" && document.pictureInPictureEnabled}
						<Button
							variant="ghost"
							size="icon"
							aria-label="Picture in picture"
							onclick={togglePip}
							class="rounded-full [&_svg]:size-5"
						>
							<PictureInPictureIcon />
						</Button>
					{/if}

					<Button
						variant="ghost"
						size="icon"
						aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
						onclick={toggleFullscreen}
						class="rounded-full [&_svg]:size-5"
					>
						{#if fullscreen}<MinimizeIcon />{:else}<MaximizeIcon />{/if}
					</Button>
				</div>
			</div>
		</div>

		<!-- Subtitle overlay -->
		{#if subtitlesOpen}
			<div
				class="pointer-events-auto absolute inset-y-0 right-0 z-10 flex w-full max-w-90 flex-col border-l border-border bg-popover text-popover-foreground backdrop-blur-md"
			>
				<div class="flex items-center justify-between border-b border-border px-4 py-3">
					<p class="text-sm font-semibold">Subtitles</p>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Close subtitles"
						onclick={() => (subtitlesOpen = false)}
						class="rounded-full"
					>
						<XIcon class="size-4" />
					</Button>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => setCaption(null)}
						class={cn("h-auto w-full justify-start gap-2 py-2", !activeCaption && "text-primary")}
					>
						<CheckIcon class={cn("size-4 shrink-0", activeCaption && "invisible")} />
						Off
					</Button>
					{#each options as option (option.key)}
						<Button
							variant="ghost"
							size="sm"
							onclick={() => setCaption(option.key)}
							class={cn(
								"h-auto w-full items-start justify-start gap-2 py-2",
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
										<span class="rounded bg-muted px-1 text-[10px] font-medium tracking-wide">SDH</span>
									{/if}
								</span>
								{#if option.addonName}
									<span class="block truncate text-xs text-muted-foreground">{option.addonName}</span>
								{/if}
							</span>
						</Button>
					{/each}
				</div>

				<div class="space-y-3 border-t border-border p-4">
					<p class="text-xs font-medium text-muted-foreground">Appearance</p>
					<div class="flex gap-1.5">
						{#each SUBTITLE_SIZES as size (size)}
							<Button
								variant={subtitleSize === size ? "default" : "outline"}
								size="sm"
								onclick={() => applyAppearance({ subtitleSize: size })}
								class="flex-1 text-xs"
							>
								{sizeLabels[size]}
							</Button>
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
									subtitleColor === swatch ? "ring-primary" : "ring-border",
								)}
								style={`background-color: ${swatch}`}
							></button>
						{/each}
					</div>
					<Button
						variant="outline"
						size="sm"
						onclick={() =>
							applyAppearance({ subtitleBackground: !subtitleBackground })}
						class="w-full justify-between text-xs"
					>
						Background plate
						<span
							class={cn(
								"rounded-full px-2 py-0.5 text-[10px]",
								subtitleBackground
									? "bg-primary/20 text-primary"
									: "bg-muted text-muted-foreground",
							)}
						>
							{subtitleBackground ? "On" : "Off"}
						</span>
					</Button>

					{#if activeCaption}
						<div class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground">
							<span>Timing</span>
							<div class="flex items-center gap-2">
								<Button
									variant="secondary"
									size="icon-xs"
									aria-label="Subtitles earlier"
									onclick={() => nudgeSubtitleOffset(-0.5)}
								>
									−
								</Button>
								<span class="w-12 text-center tabular-nums text-foreground">
									{subtitleOffset > 0 ? "+" : ""}{subtitleOffset.toFixed(1)}s
								</span>
								<Button
									variant="secondary"
									size="icon-xs"
									aria-label="Subtitles later"
									onclick={() => nudgeSubtitleOffset(0.5)}
								>
									+
								</Button>
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
