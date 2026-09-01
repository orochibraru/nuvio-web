<script lang="ts">
	import { formatTime } from "#lib/watch/player-format.js";
	import type { PlayerTransportState } from "./player-transport-state.svelte.js";

	let {
		transport,
		bufferedRatio,
		progressRatio,
		onScrub,
	}: {
		transport: PlayerTransportState;
		bufferedRatio: number;
		progressRatio: number;
		onScrub: (value: number) => void;
	} = $props();

	// Hover-scrub preview.
	let scrubTrack = $state<HTMLDivElement | null>(null);
	let hoverRatio = $state<number | null>(null);

	function handleScrub(event: Event) {
		onScrub(Number((event.currentTarget as HTMLInputElement).value));
	}

	function handleScrubHover(event: PointerEvent) {
		if (!scrubTrack) {
			return;
		}
		const rect = scrubTrack.getBoundingClientRect();
		hoverRatio = Math.min(
			1,
			Math.max(0, (event.clientX - rect.left) / rect.width),
		);
	}
</script>

<div
  bind:this={scrubTrack}
  role="presentation"
  class="group/scrub relative flex h-5 items-center"
  onpointermove={handleScrubHover}
  onpointerleave={() => (hoverRatio = null)}
>
  <div
    class="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-white/25 transition-all group-hover/scrub:h-1.5"
  ></div>
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
      {formatTime(hoverRatio * transport.duration)}
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
    max={transport.duration || 0}
    step="0.1"
    value={transport.currentTime}
    aria-label="Seek"
    oninput={handleScrub}
    class="relative h-5 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent"
  />
</div>
