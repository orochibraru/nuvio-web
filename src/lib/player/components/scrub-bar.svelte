<script lang="ts">
	import { m } from "#lib/i18n/index.js";
	import { type Chapter, chapterAt } from "#lib/player/chapters.js";
	import { formatTime } from "#lib/player/format.js";
	import type { PlayerTransportState } from "#lib/player/state/transport-state.svelte.js";

	let {
		transport,
		bufferedRatio,
		progressRatio,
		chapters,
		onScrub,
	}: {
		transport: PlayerTransportState;
		bufferedRatio: number;
		progressRatio: number;
		chapters: Chapter[];
		onScrub: (value: number) => void;
	} = $props();

	// Hover-scrub preview.
	let scrubTrack = $state<HTMLDivElement | null>(null);
	let hoverRatio = $state<number | null>(null);

	const hovered = $derived(
		hoverRatio === null
			? null
			: chapterAt(chapters, hoverRatio * transport.duration),
	);

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
    class="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/15 transition-all group-hover/scrub:h-2"
  ></div>
  <div
    class="pointer-events-none absolute h-1.5 rounded-full bg-white/25 transition-all group-hover/scrub:h-2"
    style={`width: ${bufferedRatio * 100}%`}
  ></div>
  {#if hoverRatio !== null}
    <div
      class="pointer-events-none absolute h-1.5 rounded-full bg-white/25 transition-all group-hover/scrub:h-2"
      style={`width: ${hoverRatio * 100}%`}
    ></div>
    <div
      class="pointer-events-none absolute bottom-full mb-1.5 flex -translate-x-1/2 flex-col items-center rounded-md bg-black/80 px-2 py-0.5 text-xs font-medium tabular-nums ring-1 ring-white/10 backdrop-blur-md"
      style={`left: ${hoverRatio * 100}%`}
    >
      {#if hovered?.title}
        <span class="max-w-48 truncate font-semibold">{hovered.title}</span>
      {/if}
      <span class={hovered?.title ? "text-white/60" : undefined}
        >{formatTime(hoverRatio * transport.duration)}</span
      >
    </div>
  {/if}
  <div
    class="pointer-events-none absolute h-1.5 rounded-full bg-linear-to-r from-primary/60 to-primary shadow-[0_0_12px_var(--color-primary)] transition-all group-hover/scrub:h-2"
    style={`width: ${progressRatio * 100}%`}
  ></div>
  <!-- Chapter boundaries : a gap cut into the track. -->
  {#each chapters as chapter (chapter.start)}
    {#if chapter.start > 0 && chapter.start < transport.duration}
      <div
        class="pointer-events-none absolute h-3 w-0.5 -translate-x-1/2 rounded-full bg-black/70"
        style={`left: ${(chapter.start / transport.duration) * 100}%`}
      ></div>
    {/if}
  {/each}
  <div
    class="pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full bg-white shadow-md ring-4 ring-primary/40 transition-transform group-hover/scrub:scale-125 group-focus-within/scrub:scale-125"
    style={`left: ${progressRatio * 100}%`}
  ></div>
  <input
    type="range"
    min="0"
    max={transport.duration || 0}
    step="0.1"
    value={transport.currentTime}
    aria-label={m.player_seek()}
    oninput={handleScrub}
    class="relative h-5 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-transparent"
  />
</div>
