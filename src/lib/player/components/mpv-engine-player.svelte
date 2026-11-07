<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import MaximizeIcon from "@lucide/svelte/icons/maximize";
	import MinimizeIcon from "@lucide/svelte/icons/minimize";
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
	import Volume2Icon from "@lucide/svelte/icons/volume-2";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import { onMount } from "svelte";
	import { m } from "#lib/i18n/index.js";
	import {
		type DesktopEngine,
		ENGINE_EVENT,
		type EngineState,
	} from "#lib/player/desktop-mpv.js";
	import { formatTime } from "#lib/player/format.js";
	import type { PlayerTransportState } from "#lib/player/state/transport-state.svelte.js";
	import LoadingMark from "./loading-mark.svelte";
	import ScrubBar from "./scrub-bar.svelte";

	// The player's controls over mpv drawing in this window: the page is
	// transparent here, so the video shows through from underneath.
	let {
		engine,
		title,
		subheading,
		onBack,
		onSources,
	}: {
		engine: DesktopEngine;
		title: string;
		subheading?: string | null;
		onBack: () => void;
		onSources: () => void;
	} = $props();

	const SEEK_STEP = 10;
	const HIDE_AFTER_MS = 3000;

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
	let idleTimer: ReturnType<typeof setTimeout> | undefined;

	function showControls() {
		transport.controlsVisible = true;
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => {
			if (!transport.paused) {
				transport.controlsVisible = false;
			}
		}, HIDE_AFTER_MS);
	}

	function togglePause() {
		transport.paused = !transport.paused;
		engine.command({ op: "pause", value: transport.paused });
		showControls();
	}

	function seek(position: number) {
		const target = Math.max(
			0,
			Math.min(position, transport.duration || position),
		);
		transport.currentTime = target;
		engine.command({ op: "seek", position: target });
		showControls();
	}

	function toggleMute() {
		transport.muted = !transport.muted;
		engine.command({ op: "mute", value: transport.muted });
	}

	async function toggleFullscreen() {
		if (document.fullscreenElement) {
			await document.exitFullscreen();
		} else {
			await document.documentElement.requestFullscreen();
		}
	}

	function onKey(event: KeyboardEvent) {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey) {
			return;
		}
		const actions: Record<string, () => void> = {
			" ": togglePause,
			k: togglePause,
			ArrowLeft: () => seek(transport.currentTime - SEEK_STEP),
			ArrowRight: () => seek(transport.currentTime + SEEK_STEP),
			m: toggleMute,
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
			transport.muted = state.muted;
			transport.volume = state.volume;
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
      chapters={[]}
      onScrub={seek}
    />
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="grid size-10 place-items-center rounded-full transition hover:bg-white/15"
        aria-label={transport.paused ? m.player_play_hint() : m.player_pause_hint()}
        onclick={togglePause}
      >
        {#if transport.paused}
          <PlayIcon class="size-6 fill-current" />
        {:else}
          <PauseIcon class="size-6 fill-current" />
        {/if}
      </button>
      <button
        type="button"
        class="grid size-10 place-items-center rounded-full transition hover:bg-white/15"
        aria-label={`-${SEEK_STEP}s`}
        onclick={() => seek(transport.currentTime - SEEK_STEP)}
      >
        <RotateCcwIcon class="size-5" />
      </button>
      <button
        type="button"
        class="grid size-10 place-items-center rounded-full transition hover:bg-white/15"
        aria-label={`+${SEEK_STEP}s`}
        onclick={() => seek(transport.currentTime + SEEK_STEP)}
      >
        <RotateCwIcon class="size-5" />
      </button>
      <button
        type="button"
        class="grid size-10 place-items-center rounded-full transition hover:bg-white/15"
        aria-label={transport.muted ? m.player_unmute_hint() : m.player_mute_hint()}
        onclick={toggleMute}
      >
        {#if transport.muted}
          <VolumeXIcon class="size-5" />
        {:else}
          <Volume2Icon class="size-5" />
        {/if}
      </button>
      <span class="text-sm tabular-nums text-white/80">
        {formatTime(transport.currentTime)} / {formatTime(transport.duration)}
      </span>
      <span class="flex-1"></span>
      <button
        type="button"
        class="grid size-10 place-items-center rounded-full transition hover:bg-white/15"
        aria-label={transport.fullscreen
          ? m.player_exit_fullscreen_hint()
          : m.player_fullscreen_hint()}
        onclick={() => void toggleFullscreen()}
      >
        {#if transport.fullscreen}
          <MinimizeIcon class="size-5" />
        {:else}
          <MaximizeIcon class="size-5" />
        {/if}
      </button>
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
