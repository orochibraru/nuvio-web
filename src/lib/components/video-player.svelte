<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CaptionsIcon from "@lucide/svelte/icons/captions";
	import CaptionsOffIcon from "@lucide/svelte/icons/captions-off";
	import CheckIcon from "@lucide/svelte/icons/check";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import InfoIcon from "@lucide/svelte/icons/info";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import ListVideoIcon from "@lucide/svelte/icons/list-video";
	import LoaderIcon from "@lucide/svelte/icons/loader-circle";
	import MaximizeIcon from "@lucide/svelte/icons/maximize";
	import MinimizeIcon from "@lucide/svelte/icons/minimize";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PictureInPictureIcon from "@lucide/svelte/icons/picture-in-picture-2";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import SkipForwardIcon from "@lucide/svelte/icons/skip-forward";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import Volume1Icon from "@lucide/svelte/icons/volume-1";
	import Volume2Icon from "@lucide/svelte/icons/volume-2";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import XIcon from "@lucide/svelte/icons/x";
	import { tick } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { toast } from "svelte-sonner";
	import PlaybackLoading from "#lib/components/playback-loading.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { reduced } from "#lib/motion.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import {
		SUBTITLE_COLORS,
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
	import { createSubtitleTracks } from "#lib/watch/subtitle-tracks.svelte.js";
	import { createVideoDecodeWatch } from "#lib/watch/video-decode.svelte.js";

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
		videoRisky = false,
		externalUrl = null,
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
		/** The stream label hints at a video codec the browser can't decode. */
		videoRisky?: boolean;
		/** Direct stream URL for the external-player handoff on a fatal error. */
		externalUrl?: string | null;
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
	// The track key currently being fetched + converted (drives a row spinner).
	let pendingCaption = $state<string | null>(null);
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

	// Audio plays but the picture never appears — a video codec that dodged the
	// pre-flight probe. Non-fatal + dismissible: a false alarm over a stream
	// that's actually fine must be a shrug, not a wall.
	const videoDecode = createVideoDecodeWatch({
		src: () => src,
		video: () => video,
		videoRisky: () => videoRisky,
		blocked: () => Boolean(fatalError),
	});

	const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
	const sizeLabels: Record<SubtitleSize, string> = {
		small: "Small",
		medium: "Medium",
		large: "Large",
	};
	const swatches = SUBTITLE_COLORS;

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

	// External-player handoff shown on the fatal screen (undecodable codec /
	// dead source) when the page passed a direct URL.
	let linkCopied = $state(false);
	async function copyExternal() {
		if (!externalUrl) {
			return;
		}
		try {
			await navigator.clipboard.writeText(externalUrl);
			linkCopied = true;
			setTimeout(() => {
				linkCopied = false;
			}, 2000);
		} catch {
			// clipboard blocked — the VLC link is still there
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
	// Subtitle files are fetched + converted to WebVTT in the browser, on demand
	// — never proxied through the server.
	const subs = createSubtitleTracks(() => options);
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
				void setCaption(match.key);
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

	async function setCaption(key: string | null) {
		// Fetch + convert the picked track before switching to it. A failed fetch
		// (no CORS on the addon host, dead link) leaves the current caption alone.
		if (key && !subs.ready[key]) {
			pendingCaption = key;
			const ok = await subs.resolve(key);
			pendingCaption = null;
			if (!ok) {
				toast.error(
					"That subtitle file couldn't be loaded. Try another track.",
				);
				return;
			}
		}
		await tick(); // let the freshly-rendered <track> mount its TextTrack
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
		void setCaption(keys[(index + 1) % keys.length]);
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
			? "fixed top-4 left-4 z-50 aspect-video w-52 rounded-xl shadow-2xl ring-1 ring-white/15 sm:w-64"
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
			{#if subs.ready[track.key]}
				<track
					kind="subtitles"
					srclang={track.lang}
					label={track.key}
					src={subs.ready[track.key]}
				/>
			{/if}
		{/each}
	</video>

	{#if loading && !fatalError}
		<PlaybackLoading
			backdrop={poster}
			{logo}
			{title}
			{certification}
			{genres}
			label="Loading stream"
		/>
	{/if}

	{#if silentAudio.issue && !fatalError && !minimized}
		<div
			class="absolute inset-x-4 bottom-24 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl bg-black/80 px-4 py-3 text-sm text-white ring-1 ring-white/15 backdrop-blur-md"
		>
			<div class="flex items-start gap-2.5">
				<VolumeXIcon class="mt-0.5 size-5 shrink-0" />
				<div class="min-w-0">
					<p class="font-medium">No sound from this source</p>
					<p class="text-white/70">
						{#if silentAudio.issue === "no-track"}
							It has no audio track.
						{:else}
							Its audio codec (Dolby Digital, DTS or Atmos) can't be decoded here.
						{/if}
					</p>
				</div>
			</div>
			<div class="flex shrink-0 items-center gap-1.5">
				{#if onSources}
					<Button size="xs" onclick={onSources}>Other sources</Button>
				{/if}
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label="Dismiss"
					onclick={() => silentAudio.dismiss()}
					class="text-white hover:bg-white/15"
				>
					<XIcon class="size-4" />
				</Button>
			</div>
		</div>
	{/if}

	{#if videoDecode.issue && !fatalError && !minimized}
		<div
			class="absolute inset-x-4 bottom-24 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl bg-black/80 px-4 py-3 text-sm text-white ring-1 ring-white/15 backdrop-blur-md"
		>
			<div class="flex items-start gap-2.5">
				<TriangleAlertIcon class="mt-0.5 size-5 shrink-0" />
				<div class="min-w-0">
					<p class="font-medium">The video may not be playing</p>
					<p class="text-white/70">
						This browser might not decode this source's video codec. If the
						picture looks fine, dismiss this.
					</p>
				</div>
			</div>
			<div class="flex shrink-0 items-center gap-1.5">
				{#if onSources}
					<Button size="xs" onclick={onSources}>Other sources</Button>
				{/if}
				<Button
					size="xs"
					variant="secondary"
					onclick={() => videoDecode.dismiss()}
				>
					Looks fine
				</Button>
			</div>
		</div>
	{/if}

	{#if fatalError}
		<div class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center text-white">
			<TriangleAlertIcon class="size-8 text-destructive" />
			<h2 class="text-lg font-semibold">Can't play this source</h2>
			<p class="max-w-sm text-sm text-white/70">{fatalError}</p>
			<div class="mt-1 flex flex-wrap items-center justify-center gap-2">
				{#if onSources}
					<Button onclick={onSources}>
						<LayersIcon data-icon="inline-start" /> Choose another source
					</Button>
				{/if}
				{#if externalUrl}
					<Button variant="secondary" href={`vlc://${externalUrl}`}>
						<ExternalLinkIcon data-icon="inline-start" /> Open in VLC
					</Button>
					<Button variant="ghost" onclick={copyExternal}>
						{#if linkCopied}
							<CheckIcon data-icon="inline-start" /> Copied
						{:else}
							<CopyIcon data-icon="inline-start" /> Copy link
						{/if}
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
	     overlay behind it stays interactive; each bar re-enables pointer events.
	     `invisible` (not just opacity-0) so a hidden bar can't swallow a tap. -->
	<div
		class={cn(
			"pointer-events-none absolute inset-0 z-30 flex flex-col justify-between bg-linear-to-t from-black/80 via-black/10 to-black/60 transition-[opacity,visibility] duration-200",
			minimized || !controlsVisible || fatalError
				? "invisible opacity-0"
				: "opacity-100",
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

		<!-- Centre transport cluster — hidden while the info or subtitles overlay
		     owns the frame. -->
		{#if !loading && !fatalError && !infoOpen && !subtitlesOpen}
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
					class="pointer-events-auto size-16 rounded-full bg-black/40 shadow-lg ring-1 ring-white/20 backdrop-blur-md transition hover:scale-105 hover:bg-black/55 sm:size-18 [&_svg]:size-11 sm:[&_svg]:size-12"
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
					class="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full bg-primary opacity-0 shadow transition-opacity group-hover/scrub:opacity-100 group-focus-within/scrub:opacity-100"
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
						class="hidden h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/30 sm:block [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
					/>
				</div>

				<span class="ml-1 shrink-0 text-xs whitespace-nowrap tabular-nums text-white/70">
					{formatTime(currentTime)}
					<span class="text-white/45">/ {formatTime(duration)}</span>
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

		<!-- Subtitle overlay: dims the whole player and lays the picker over it on
		     the left, mirroring the info overlay's own treatment — a drawer here
		     used to fight the sources drawer for the same strip of screen, and
		     covering only that strip left the transport cluster clickable
		     underneath it. Sits below the transport controls (z-30). -->
		{#if subtitlesOpen}
			<div class="absolute inset-0 z-20 overflow-hidden" transition:fade={reduced({ duration: 150 })}>
				<div class="absolute inset-0 bg-black/85"></div>
				<div
					class="absolute inset-x-0 top-16 bottom-20 flex items-center justify-start px-6 pb-6 sm:top-20 sm:bottom-24 sm:px-12"
					transition:fly={reduced({ y: 16, duration: 220 })}
				>
					<div class="flex max-h-full w-full max-w-sm flex-col gap-4 text-white">
						<div class="flex shrink-0 items-center gap-3">
							<span class="flex flex-1 items-center gap-1.5 text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">
								<CaptionsIcon class="size-3.5" />
								Subtitles
							</span>
							<Button
								variant="secondary"
								size="icon"
								aria-label="Close subtitles"
								onclick={() => (subtitlesOpen = false)}
								class="shrink-0 rounded-full"
							>
								<XIcon class="size-5" />
							</Button>
						</div>

						<div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
							<Button
								variant="ghost"
								size="sm"
								onclick={() => setCaption(null)}
								class={cn(
									"h-auto w-full justify-start gap-2 py-2 text-white hover:bg-white/10 hover:text-white",
									!activeCaption && "text-primary",
								)}
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
										"h-auto w-full items-start justify-start gap-2 py-2 text-white hover:bg-white/10 hover:text-white",
										activeCaption === option.key && "text-primary",
									)}
								>
									<CheckIcon
										class={cn(
											"mt-0.5 size-4 shrink-0",
											activeCaption !== option.key && "invisible",
										)}
									/>
									<span class="flex min-w-0 flex-1 flex-col items-start">
										<span class="flex items-center gap-1.5">
											{option.name}
											{#if option.sdh}
												<span class="rounded bg-white/10 px-1 text-[10px] font-medium tracking-wide">SDH</span>
											{/if}
											{#if subs.failed[option.key]}
												<span class="rounded bg-destructive/20 px-1 text-[10px] font-medium tracking-wide text-destructive">
													unavailable
												</span>
											{/if}
											{#if pendingCaption === option.key}
												<LoaderIcon class="size-3 animate-spin text-white/60" />
											{/if}
										</span>
										{#if option.addonName}
											<span class="block max-w-full truncate text-xs text-white/50">{option.addonName}</span>
										{/if}
									</span>
								</Button>
							{/each}
						</div>

						<div class="shrink-0 space-y-3 border-t border-white/10 pt-4">
							<p class="text-xs font-semibold tracking-wide text-white/50 uppercase">Appearance</p>
							<div class="flex gap-1.5">
								{#each SUBTITLE_SIZES as size (size)}
									<Button
										variant={subtitleSize === size ? "default" : "secondary"}
										size="sm"
										onclick={() => applyAppearance({ subtitleSize: size })}
										class="flex-1"
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
										aria-pressed={subtitleColor === swatch}
										onclick={() => applyAppearance({ subtitleColor: swatch })}
										class={cn(
											"size-8 rounded-full ring-2 ring-offset-2 ring-offset-black transition",
											subtitleColor === swatch ? "ring-white" : "ring-transparent",
										)}
										style={`background-color: ${swatch}`}
									></button>
								{/each}
							</div>
							<Button
								variant="secondary"
								size="sm"
								onclick={() =>
									applyAppearance({ subtitleBackground: !subtitleBackground })}
								class="w-full justify-between"
							>
								Background plate
								<span
									class={cn(
										"rounded-full px-2 py-0.5 text-[10px]",
										subtitleBackground
											? "bg-primary/20 text-primary"
											: "bg-white/10 text-white/60",
									)}
								>
									{subtitleBackground ? "On" : "Off"}
								</span>
							</Button>

							{#if activeCaption}
								<div class="flex items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2 text-xs font-medium text-white/60">
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
										<span class="w-12 text-center tabular-nums text-white">
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
