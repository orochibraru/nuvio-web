<script lang="ts">
	import FastForwardIcon from "@lucide/svelte/icons/fast-forward";
	import RewindIcon from "@lucide/svelte/icons/rewind";
	import SunIcon from "@lucide/svelte/icons/sun";
	import Volume2Icon from "@lucide/svelte/icons/volume-2";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { BRIGHTNESS_RANGE } from "#lib/player/gestures.js";
	import type { GestureFeedback } from "#lib/player/state/touch-gestures.svelte.js";
	import { cn } from "#lib/utils.js";

	let { feedback }: { feedback: GestureFeedback | null } = $props();

	const pill =
		"flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md";

	// The bar's fill, 0..1 across the level's own range.
	const fill = $derived(
		feedback?.kind === "volume"
			? feedback.level
			: feedback?.kind === "brightness"
				? (feedback.level - BRIGHTNESS_RANGE.min) /
					(BRIGHTNESS_RANGE.max - BRIGHTNESS_RANGE.min)
				: 0,
	);
	const percentFormat = new Intl.NumberFormat(getLocale(), {
		style: "percent",
		maximumFractionDigits: 0,
	});
	const percent = (level: number) => percentFormat.format(level);
</script>

<!-- What a touch gesture just did : a seek, the 2x hold, a volume / brightness
     level. Purely visual; it never takes a touch. -->
<div class="pointer-events-none absolute inset-0 z-40" aria-live="polite">
  {#if feedback?.kind === "seek"}
    <div
      class={cn(
        "absolute inset-y-0 flex w-1/3 items-center justify-center bg-white/5",
        feedback.side === "left" ? "left-0 rounded-r-[50%]" : "right-0 rounded-l-[50%]",
      )}
    >
      <span class={pill}>
        {#if feedback.side === "left"}
          <RewindIcon class="size-4 fill-current" />
          {m.player_gesture_back({ seconds: feedback.seconds })}
        {:else}
          {m.player_gesture_forward({ seconds: feedback.seconds })}
          <FastForwardIcon class="size-4 fill-current" />
        {/if}
      </span>
    </div>
  {:else if feedback?.kind === "speed"}
    <div class="absolute inset-x-0 top-[max(1.5rem,env(safe-area-inset-top))] flex justify-center">
      <span class={pill}>
        {m.player_gesture_speed()}
        <FastForwardIcon class="size-4 fill-current" />
      </span>
    </div>
  {:else if feedback}
    <div class="absolute inset-x-0 top-[max(1.5rem,env(safe-area-inset-top))] flex justify-center">
      <span class={cn(pill, "w-48")}>
        {#if feedback.kind === "brightness"}
          <SunIcon class="size-4 shrink-0" aria-hidden="true" />
          <span class="sr-only">
            {m.player_gesture_brightness({ percent: percent(feedback.level) })}
          </span>
        {:else if feedback.level === 0}
          <VolumeXIcon class="size-4 shrink-0" aria-hidden="true" />
        {:else}
          <Volume2Icon class="size-4 shrink-0" aria-hidden="true" />
        {/if}
        {#if feedback.kind === "volume"}
          <span class="sr-only">
            {m.player_gesture_volume({ percent: percent(feedback.level) })}
          </span>
        {/if}
        <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
          <span
            class="block h-full rounded-full bg-white"
            style:width={`${Math.round(fill * 100)}%`}
          ></span>
        </span>
        <span class="w-11 text-right text-xs tabular-nums" aria-hidden="true">
          {percent(feedback.level)}
        </span>
      </span>
    </div>
  {/if}
</div>
