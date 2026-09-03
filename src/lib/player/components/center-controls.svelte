<script lang="ts">
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
	import { Button } from "#lib/components/ui/button/index.js";
	import type { PlayerTransportState } from "#lib/player/state/transport-state.svelte.js";

	let {
		transport,
		onSeek,
		onTogglePlay,
	}: {
		transport: PlayerTransportState;
		onSeek: (delta: number) => void;
		onTogglePlay: () => void;
	} = $props();
</script>

<div
  class="pointer-events-none absolute inset-0 flex items-center justify-center gap-8 sm:gap-12"
>
  <Button
    variant="ghost"
    aria-label="Back 10 seconds"
    onclick={() => onSeek(-10)}
    class="pointer-events-auto size-14 rounded-full [&_svg]:size-10"
  >
    <RotateCcwIcon />
  </Button>
  <Button
    variant="ghost"
    aria-label={transport.ended ? "Replay" : transport.paused ? "Play" : "Pause"}
    onclick={onTogglePlay}
    class="pointer-events-auto size-16 rounded-full bg-black/40 shadow-lg ring-1 ring-white/20 backdrop-blur-md transition hover:scale-105 hover:bg-black/55 sm:size-18 [&_svg]:size-11 sm:[&_svg]:size-12"
  >
    {#if transport.ended}
      <RotateCwIcon />
    {:else if transport.paused}
      <PlayIcon class="fill-current" />
    {:else}
      <PauseIcon class="fill-current" />
    {/if}
  </Button>
  <Button
    variant="ghost"
    aria-label="Forward 10 seconds"
    onclick={() => onSeek(10)}
    class="pointer-events-auto size-14 rounded-full [&_svg]:size-10"
  >
    <RotateCwIcon />
  </Button>
</div>
