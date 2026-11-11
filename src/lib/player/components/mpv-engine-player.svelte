<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import { onMount } from "svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { segmentChapters } from "#lib/player/chapters.js";
	import {
		type DesktopEngine,
		ENGINE_EVENT,
		type EngineState,
		type EngineTrack,
	} from "#lib/player/desktop-mpv.js";
	import {
		activeEngineCaption,
		engineAudioTracks,
		engineCaptionCommand,
		engineSubtitleOptions,
		preferredEngineAudio,
		preferredEngineCaption,
	} from "#lib/player/engine-tracks.js";
	import { formatTime } from "#lib/player/format.js";
	import { createPlaybackMilestones } from "#lib/player/state/milestones.svelte.js";
	import type { PlayerMenu } from "#lib/player/state/panel-toggles.svelte.js";
	import type { PlayerTransportState } from "#lib/player/state/transport-state.svelte.js";
	import type { SubtitleAppearance, SubtitleTrack } from "#lib/player/types.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { SubtitleSize } from "#lib/settings/ui-settings.js";
	import ControlRow from "./control-row.svelte";
	import LoadingMark from "./loading-mark.svelte";
	import ScrubBar from "./scrub-bar.svelte";
	import SubtitlePanel from "./subtitle-panel.svelte";

	// The player's controls over mpv drawing in this window: the page is
	// transparent here, so the video shows through from underneath.
	let {
		engine,
		title,
		subheading,
		onBack,
		onSources,
		subtitles = [],
		preferredLanguage = "",
		audioLanguages = [],
		subtitleSize = "medium",
		subtitleColor = "#ffffff",
		subtitleBackground = true,
		subtitleOutline = false,
		onSubtitleAppearance,
		introStart = null,
		introEnd = null,
		outroStart = null,
		onOutro,
		onNext,
		onEpisodes,
	}: {
		engine: DesktopEngine;
		title: string;
		subheading?: string | null;
		onBack: () => void;
		onSources: () => void;
		/** The addon's subtitles: mpv fetches one when it's picked. */
		subtitles?: SubtitleTrack[];
		preferredLanguage?: string;
		/** Audio languages wanted, best first. */
		audioLanguages?: string[];
		subtitleSize?: SubtitleSize;
		subtitleColor?: string;
		subtitleBackground?: boolean;
		subtitleOutline?: boolean;
		onSubtitleAppearance?: (patch: SubtitleAppearance) => void;
		introStart?: number | null;
		introEnd?: number | null;
		outroStart?: number | null;
		onOutro?: () => void;
		onNext?: () => void;
		onEpisodes?: () => void;
	} = $props();

	const SEEK_STEP = 10;
	const VOLUME_STEP = 0.05;
	const HIDE_AFTER_MS = 3000;

	// Volume, mute and speed are the page's: mpv's echo would fight a drag.
	const transport = $state<PlayerTransportState>({
		paused: false,
		currentTime: 0,
		duration: 0,
		volume: 1,
		muted: false,
		buffered: [],
		rate: 1,
		fullscreen: false,
		loading: true,
		ended: false,
		controlsVisible: true,
	});
	let tracks = $state<EngineTrack[]>([]);
	let boost = $state(1);
	let subtitleOffset = $state(0);
	let openMenu = $state<PlayerMenu | null>(null);
	let subtitlesOpen = $state(false);
	let pendingCaption = $state<string | null>(null);
	let audioChosen = false;
	let captionChosen = false;
	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	const trackName = (number: number) =>
		m.player_audio_track_fallback({ number });
	const captionOptions = $derived(
		engineSubtitleOptions(tracks, subtitles, getLocale(), (number) =>
			m.player_subtitle_track({ number }),
		),
	);
	const activeCaption = $derived(activeEngineCaption(tracks));
	const audioTracks = $derived(engineAudioTracks(tracks, trackName));
	const chapters = $derived(
		segmentChapters(
			{ introStart, introEnd, outroStart },
			{ intro: m.player_chapter_intro(), credits: m.player_chapter_credits() },
		),
	);

	function command(next: Parameters<DesktopEngine["command"]>[0]) {
		engine.command(next);
	}

	function showControls() {
		transport.controlsVisible = true;
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			if (!(transport.paused || openMenu || subtitlesOpen)) {
				transport.controlsVisible = false;
			}
		}, HIDE_AFTER_MS);
	}

	function togglePause() {
		transport.paused = !transport.paused;
		command({ op: "pause", value: transport.paused });
		showControls();
	}

	function seek(position: number) {
		const target = Math.max(
			0,
			Math.min(position, transport.duration || position),
		);
		transport.currentTime = target;
		command({ op: "seek", position: target });
		showControls();
	}

	async function toggleFullscreen() {
		if (document.fullscreenElement) {
			await document.exitFullscreen();
		} else {
			await document.documentElement.requestFullscreen();
		}
	}

	function setVolume(volume: number) {
		transport.volume = Math.min(1, Math.max(0, volume));
		transport.muted = false;
		showControls();
	}

	function selectCaption(key: string | null) {
		captionChosen = true;
		const next = engineCaptionCommand(key, captionOptions);
		if (next) {
			pendingCaption = next.op === "subtitle-add" ? key : null;
			command(next);
		}
	}

	const milestones = createPlaybackMilestones({
		transport,
		skipTo: (time) => {
			seek(time);
			if (transport.paused) {
				togglePause();
			}
		},
		minimized: () => false,
		fatalError: () => false,
		introStart: () => introStart,
		introEnd: () => introEnd,
		outroStart: () => outroStart,
		autoSkip: () => theme.current.autoSkipSegments,
		onOutro: () => onOutro?.(),
	});

	$effect(() => {
		command({ op: "volume", value: transport.volume * boost });
	});
	$effect(() => {
		command({ op: "mute", value: transport.muted });
	});
	$effect(() => {
		command({ op: "speed", value: transport.rate });
	});
	$effect(() => {
		command({ op: "subtitle-delay", value: subtitleOffset });
	});
	$effect(() => {
		command({
			op: "subtitle-style",
			size: subtitleSize,
			color: subtitleColor,
			background: subtitleBackground,
			outline: subtitleOutline,
		});
	});
	$effect(() => {
		if (pendingCaption !== null && pendingCaption === activeCaption) {
			pendingCaption = null;
		}
	});

	// The viewer's languages, once the file's tracks are known: the audio
	// once, the subtitle as soon as a track in that language turns up (an
	// addon's list can land after the file opens), unless they picked one.
	$effect(() => {
		if (!audioChosen && audioTracks.length > 0) {
			audioChosen = true;
			const id = preferredEngineAudio(tracks, audioLanguages);
			if (id !== null) {
				command({ op: "audio", id });
			}
		}
	});
	$effect(() => {
		if (captionChosen || tracks.length === 0) {
			return;
		}
		const key = preferredEngineCaption(captionOptions, preferredLanguage);
		if (key) {
			selectCaption(key);
		}
	});

	function onKey(event: KeyboardEvent) {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey) {
			return;
		}
		const actions: Record<string, () => void> = {
			" ": togglePause,
			k: togglePause,
			ArrowLeft: () => seek(transport.currentTime - SEEK_STEP),
			ArrowRight: () => seek(transport.currentTime + SEEK_STEP),
			ArrowUp: () => setVolume(transport.volume + VOLUME_STEP),
			ArrowDown: () => setVolume(transport.volume - VOLUME_STEP),
			m: () => {
				transport.muted = !transport.muted;
			},
			f: () => void toggleFullscreen(),
		};
		const action = actions[event.key];
		if (action) {
			event.preventDefault();
			action();
		}
	}

	onMount(() => {
		const onState = (event: Event) => {
			const state = (event as CustomEvent<EngineState>).detail;
			transport.currentTime = state.position;
			transport.duration = state.duration;
			transport.paused = state.paused;
			transport.loading = state.buffering || state.duration === 0;
			transport.ended = state.ended;
			tracks = state.tracks ?? [];
		};
		const onFullscreen = () => {
			transport.fullscreen = Boolean(document.fullscreenElement);
		};
		window.addEventListener(ENGINE_EVENT, onState);
		document.addEventListener("fullscreenchange", onFullscreen);
		document.documentElement.classList.add("mpv-engine");
		showControls();
		return () => {
			clearTimeout(idleTimer);
			window.removeEventListener(ENGINE_EVENT, onState);
			document.removeEventListener("fullscreenchange", onFullscreen);
			document.documentElement.classList.remove("mpv-engine");
		};
	});
</script>

<svelte:window onkeydown={onKey} />

{#snippet subtitleMenu()}
  <SubtitlePanel
    open={subtitlesOpen}
    options={captionOptions}
    {activeCaption}
    {pendingCaption}
    failed={{}}
    {preferredLanguage}
    {subtitleSize}
    {subtitleColor}
    {subtitleBackground}
    {subtitleOutline}
    {subtitleOffset}
    onOpenChange={(open) => {
      subtitlesOpen = open;
      if (open) {
        openMenu = null;
      }
    }}
    onSelect={selectCaption}
    onAppearance={(patch) => onSubtitleAppearance?.(patch)}
    onNudgeOffset={(delta) => {
      subtitleOffset = Math.round((subtitleOffset + delta) * 10) / 10;
    }}
  />
{/snippet}

<div
  class="absolute inset-0 z-10 flex flex-col justify-between {transport.controlsVisible
    ? 'cursor-default'
    : 'cursor-none'}"
  data-testid="mpv-engine"
  role="region"
  aria-label={m.player_region()}
  onpointermove={showControls}
>
  <div
    class="flex items-center gap-3 bg-linear-to-b from-black/70 to-transparent px-4 pt-4 pb-10 transition-opacity duration-300 {transport.controlsVisible
      ? 'opacity-100'
      : 'pointer-events-none opacity-0'}"
  >
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/20"
      onclick={onBack}
    >
      <ArrowLeftIcon class="size-4" /> {m.common_back()}
    </button>
    <div class="min-w-0 flex-1">
      <p class="truncate font-semibold">{title}</p>
      {#if subheading}
        <p class="truncate text-sm text-white/70">{subheading}</p>
      {/if}
    </div>
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/20"
      onclick={onSources}
    >
      <LayersIcon class="size-4" /> {m.common_sources()}
    </button>
  </div>

  {#if transport.loading}
    <div class="pointer-events-none absolute inset-0 grid place-items-center">
      <LoadingMark />
    </div>
  {/if}

  {#if milestones.showSkipIntro}
    <div
      class="pointer-events-none absolute inset-x-0 bottom-32 z-20 flex justify-end px-4 sm:bottom-40 sm:px-6"
    >
      <Button onclick={milestones.skipIntro} class="pointer-events-auto shadow-lg">
        {m.player_skip_intro()}
      </Button>
    </div>
  {/if}

  <div
    class="flex flex-col gap-2 bg-linear-to-t from-black/80 to-transparent px-4 pt-10 pb-4 transition-opacity duration-300 {transport.controlsVisible
      ? 'opacity-100'
      : 'pointer-events-none opacity-0'}"
  >
    <ScrubBar
      {transport}
      bufferedRatio={0}
      progressRatio={transport.duration > 0
        ? transport.currentTime / transport.duration
        : 0}
      {chapters}
      onScrub={seek}
    />
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="grid size-10 place-items-center rounded-full transition hover:bg-white/15"
        aria-label={`-${SEEK_STEP}s`}
        onclick={() => seek(transport.currentTime - SEEK_STEP)}
      >
        <RotateCcwIcon class="size-5" />
      </button>
      <span class="text-sm tabular-nums text-white/80">
        {formatTime(transport.currentTime)} / {formatTime(transport.duration)}
      </span>
      <div class="min-w-0 flex-1">
        <ControlRow
          {transport}
          player={{
            togglePlay: togglePause,
            toggleFullscreen,
            togglePip: () => Promise.resolve(),
          }}
          media={{
            audioTracks,
            activeAudioTrack:
              audioTracks.find((track) => track.selected)?.id ?? -1,
            selectAudioTrack: (id) => command({ op: "audio", id }),
          }}
          {onNext}
          {onEpisodes}
          {subtitleMenu}
          castAvailable={false}
          casting={false}
          onCast={() => undefined}
          {openMenu}
          onMenuOpenChange={(menu, open) => {
            openMenu = open ? menu : null;
            if (open) {
              subtitlesOpen = false;
            }
          }}
          {boost}
          boostPending={false}
          onBoostSelect={(level) => {
            boost = level;
          }}
          pip={false}
        />
      </div>
    </div>
  </div>
</div>

<style>
  /* mpv draws under the page: everything between it and the window must be
     see-through while this is mounted. */
  :global(html.mpv-engine),
  :global(html.mpv-engine body),
  :global(html.mpv-engine [data-player]) {
    background: transparent !important;
  }
</style>
