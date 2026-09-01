<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { Button } from "#lib/components/ui/button/index.js";
	import { cn } from "#lib/utils.js";

	const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];

	let {
		rate,
		audioTracks,
		activeAudioTrack,
		onRateSelect,
		onAudioTrackSelect,
	}: {
		rate: number;
		audioTracks: Array<{ id: number; label: string }>;
		activeAudioTrack: number;
		onRateSelect: (rate: number) => void;
		onAudioTrackSelect: (id: number) => void;
	} = $props();
</script>

<div
  class="absolute right-0 bottom-11 max-h-[70vh] w-44 overflow-y-auto rounded-lg border border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-md backdrop-blur-md scrollbar-thin"
>
  <p class="px-2 py-1 text-xs font-medium text-muted-foreground">
    Playback speed
  </p>
  {#each rates as option (option)}
    <Button
      variant="ghost"
      size="sm"
      onclick={() => onRateSelect(option)}
      class={cn("w-full justify-between", rate === option && "text-primary")}
    >
      {option === 1 ? "Normal" : `${option}×`}
      {#if rate === option}<CheckIcon class="size-3.5" />{/if}
    </Button>
  {/each}
  {#if audioTracks.length > 1}
    <p class="mt-1 px-2 py-1 text-xs font-medium text-muted-foreground">
      Audio
    </p>
    {#each audioTracks as track (track.id)}
      <Button
        variant="ghost"
        size="sm"
        onclick={() => onAudioTrackSelect(track.id)}
        class={cn(
          "w-full justify-between",
          activeAudioTrack === track.id && "text-primary",
        )}
      >
        <span class="truncate">{track.label}</span>
        {#if activeAudioTrack === track.id}<CheckIcon
            class="size-3.5 shrink-0"
          />{/if}
      </Button>
    {/each}
  {/if}
</div>
