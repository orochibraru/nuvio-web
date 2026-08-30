<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CaptionsIcon from "@lucide/svelte/icons/captions";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import MaximizeIcon from "@lucide/svelte/icons/maximize";
	import MinimizeIcon from "@lucide/svelte/icons/minimize";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PictureInPictureIcon from "@lucide/svelte/icons/picture-in-picture-2";
	import PlayIcon from "@lucide/svelte/icons/play";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Volume1Icon from "@lucide/svelte/icons/volume-1";
	import Volume2Icon from "@lucide/svelte/icons/volume-2";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import Hls from "hls.js";
	import { onDestroy } from "svelte";
	import PlaybackLoading from "$lib/components/playback-loading.svelte";
	import { cn } from "$lib/utils.js";

	type SubtitleTrack = { lang: string; url: string };

	let {
		src,
		poster = null,
		logo = null,
		title,
		subheading = null,
		startTime = 0,
		subtitles = [],
		fill = false,
		onProgress,
		onEnded,
		onBack,
		onSources,
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
		onProgress?: (position: number, duration: number) => void;
		onEnded?: () => void;
		onBack?: () => void;
		onSources?: () => void;
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
	let controlsVisible = $state(true);
	let settingsOpen = $state(false);
	let activeCaption = $state<string | null>(null);
	let seeded = false;

	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let progressTimer: ReturnType<typeof setInterval> | undefined;

	const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];

	const bufferedEnd = $derived(buffered.at(-1)?.end ?? 0);

	$effect(() => {
		const el = video;
		if (!el || !src) {
			return;
		}
		fatalError = null;
		seeded = false;
		loading = true;

		if (src.toLowerCase().includes(".m3u8") && Hls.isSupported()) {
			const hls = new Hls({ maxBufferLength: 30 });
			hls.loadSource(src);
			hls.attachMedia(el);
			hls.on(Hls.Events.ERROR, (_event, data) => {
				if (data.fatal) {
					fatalError = "This stream could not be played.";
				}
			});
			return () => hls.destroy();
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
	}

	function onWaiting() {
		loading = true;
	}

	function togglePlay() {
		if (!video) {
			return;
		}
		if (video.paused) {
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

	function onScrub(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (video) {
			video.currentTime = value;
		}
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

	function setCaption(lang: string | null) {
		if (!video) {
			return;
		}
		for (const track of Array.from(video.textTracks)) {
			track.mode = track.language === lang ? "showing" : "disabled";
		}
		activeCaption = lang;
		settingsOpen = false;
	}

	function cycleCaption() {
		if (subtitles.length === 0) {
			return;
		}
		const index = subtitles.findIndex((entry) => entry.lang === activeCaption);
		const next = subtitles[index + 1]?.lang ?? null;
		setCaption(index === -1 ? subtitles[0].lang : next);
	}

	function nudgeControls() {
		controlsVisible = true;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			if (!paused && !settingsOpen) {
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
		"relative w-full overflow-hidden bg-black select-none",
		fill ? "h-full" : "aspect-video rounded-lg",
	)}
	class:cursor-none={!controlsVisible}
	onmousemove={nudgeControls}
	onmouseleave={() => !paused && (controlsVisible = false)}
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
		onclick={togglePlay}
		onended={onEnded}
	>
		{#each subtitles as track (track.lang)}
			<track
				kind="subtitles"
				srclang={track.lang}
				label={track.lang}
				src={`/api/subtitle?url=${encodeURIComponent(track.url)}`}
			/>
		{/each}
	</video>

	{#if loading && !fatalError}
		<PlaybackLoading backdrop={poster} {logo} {title} label="Loading stream…" />
	{/if}

	{#if fatalError}
		<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-center text-white">
			<p>{fatalError}</p>
			{#if onBack}
				<button type="button" onclick={onBack} class="rounded-md bg-white/15 px-3 py-1.5 text-sm">
					Back
				</button>
			{/if}
		</div>
	{/if}

	<div
		class={cn(
			"absolute inset-0 flex flex-col justify-between bg-linear-to-t from-black/70 via-transparent to-black/50 p-3 transition-opacity sm:p-4",
			controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
		)}
	>
		<div class="flex items-start gap-3 text-white">
			{#if onBack}
				<button type="button" aria-label="Back" onclick={onBack} class="rounded-md p-1.5 hover:bg-white/15">
					<ArrowLeftIcon class="size-5" />
				</button>
			{/if}
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">{title}</p>
				{#if subheading}
					<p class="truncate text-sm text-white/70">{subheading}</p>
				{/if}
			</div>
			{#if onSources}
				<button
					type="button"
					onclick={onSources}
					class="flex shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-medium hover:bg-white/20"
				>
					<LayersIcon class="size-4" /> Sources
				</button>
			{/if}
		</div>

		{#if paused && !fatalError && !loading}
			<button
				type="button"
				aria-label="Play"
				onclick={togglePlay}
				class="absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
			>
				<PlayIcon class="size-8" />
			</button>
		{/if}

		<div class="flex flex-col gap-2 text-white">
			<div class="relative flex items-center">
				<div class="absolute h-1 w-full rounded-full bg-white/25"></div>
				<div
					class="absolute h-1 rounded-full bg-white/40"
					style={`width: ${duration ? (bufferedEnd / duration) * 100 : 0}%`}
				></div>
				<div
					class="absolute h-1 rounded-full bg-primary"
					style={`width: ${duration ? (currentTime / duration) * 100 : 0}%`}
				></div>
				<input
					type="range"
					min="0"
					max={duration || 0}
					step="0.1"
					value={currentTime}
					aria-label="Seek"
					oninput={onScrub}
					class="relative h-4 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
				/>
			</div>

			<div class="flex items-center gap-3">
				<button type="button" aria-label={paused ? "Play" : "Pause"} onclick={togglePlay}>
					{#if paused}<PlayIcon class="size-5" />{:else}<PauseIcon class="size-5" />{/if}
				</button>

				<div class="group/vol flex items-center gap-1.5">
					<button type="button" aria-label="Mute" onclick={() => (muted = !muted)}>
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
						class="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 opacity-0 transition-all group-hover/vol:w-16 group-hover/vol:opacity-100 [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
					/>
				</div>

				<span class="text-xs tabular-nums text-white/80">
					{fmt(currentTime)} / {fmt(duration)}
				</span>

				<div class="ml-auto flex items-center gap-2">
					{#if subtitles.length > 0}
						<button
							type="button"
							aria-label="Captions"
							onclick={() => setCaption(activeCaption ? null : subtitles[0].lang)}
							class={cn("rounded p-1", activeCaption && "text-primary")}
						>
							<CaptionsIcon class="size-5" />
						</button>
					{/if}

					<div class="relative">
						<button type="button" aria-label="Settings" onclick={() => (settingsOpen = !settingsOpen)}>
							<SettingsIcon class="size-5" />
						</button>
						{#if settingsOpen}
							<div
								class="absolute right-0 bottom-8 w-40 rounded-md border border-white/15 bg-black/90 p-1 text-sm backdrop-blur"
							>
								<p class="px-2 py-1 text-xs text-white/50">Speed</p>
								{#each rates as option (option)}
									<button
										type="button"
										onclick={() => {
											rate = option;
											settingsOpen = false;
										}}
										class={cn(
											"block w-full rounded px-2 py-1 text-left hover:bg-white/10",
											rate === option && "text-primary",
										)}
									>
										{option}×
									</button>
								{/each}
								{#if subtitles.length > 0}
									<p class="mt-1 px-2 py-1 text-xs text-white/50">Subtitles</p>
									<button
										type="button"
										onclick={() => setCaption(null)}
										class={cn(
											"block w-full rounded px-2 py-1 text-left hover:bg-white/10",
											!activeCaption && "text-primary",
										)}
									>
										Off
									</button>
									{#each subtitles as track (track.lang)}
										<button
											type="button"
											onclick={() => setCaption(track.lang)}
											class={cn(
												"block w-full rounded px-2 py-1 text-left hover:bg-white/10",
												activeCaption === track.lang && "text-primary",
											)}
										>
											{track.lang}
										</button>
									{/each}
								{/if}
							</div>
						{/if}
					</div>

					{#if typeof document !== "undefined" && document.pictureInPictureEnabled}
						<button type="button" aria-label="Picture in picture" onclick={togglePip}>
							<PictureInPictureIcon class="size-5" />
						</button>
					{/if}

					<button
						type="button"
						aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
						onclick={toggleFullscreen}
					>
						{#if fullscreen}<MinimizeIcon class="size-5" />{:else}<MaximizeIcon class="size-5" />{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
