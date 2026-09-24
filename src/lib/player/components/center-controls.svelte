<script lang="ts">
	import PauseIcon from "@lucide/svelte/icons/pause";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import RotateCwIcon from "@lucide/svelte/icons/rotate-cw";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/i18n/index.js";
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
    aria-label={m.player_back_10()}
    title={m.player_back_10_hint()}
    onclick={() => onSeek(-10)}
    class="pointer-events-auto size-14 rounded-full bg-black/25 ring-1 ring-white/10 backdrop-blur-md transition hover:scale-105 hover:bg-black/45 dark:hover:bg-black/45 [&_svg]:size-7"
  >
    <RotateCcwIcon />
  </Button>
  <Button
    variant="ghost"
    aria-label={transport.ended
      ? m.player_replay()
      : transport.paused
        ? m.common_play()
        : m.player_pause()}
    title={transport.ended
      ? m.player_replay_hint()
      : transport.paused
        ? m.player_play_hint()
        : m.player_pause_hint()}
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
    aria-label={m.player_forward_10()}
    title={m.player_forward_10_hint()}
    onclick={() => onSeek(10)}
    class="pointer-events-auto size-14 rounded-full bg-black/25 ring-1 ring-white/10 backdrop-blur-md transition hover:scale-105 hover:bg-black/45 dark:hover:bg-black/45 [&_svg]:size-7"
  >
    <RotateCwIcon />
  </Button>
</div>
