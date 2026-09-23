<script lang="ts">
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import XIcon from "@lucide/svelte/icons/x";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/i18n/index.js";

	let {
		noTrack,
		onSources,
		onDismiss,
	}: {
		noTrack: boolean;
		onSources?: () => void;
		onDismiss: () => void;
	} = $props();
</script>

<div
  class="absolute inset-x-4 bottom-24 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl bg-black/80 px-4 py-3 text-sm text-white ring-1 ring-white/15 backdrop-blur-md"
>
  <div class="flex items-start gap-2.5">
    <VolumeXIcon class="mt-0.5 size-5 shrink-0" />
    <div class="min-w-0">
      <p class="font-medium">{m.player_no_sound()}</p>
      <p class="text-white/70">
        {#if noTrack}
          {m.player_no_audio_track()}
        {:else}
          {m.player_audio_codec_unsupported()}
        {/if}
      </p>
    </div>
  </div>
  <div class="flex shrink-0 items-center gap-1.5">
    {#if onSources}
      <Button size="xs" onclick={onSources}>{m.player_other_sources()}</Button>
    {/if}
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={m.common_dismiss()}
      onclick={onDismiss}
      class="text-white hover:bg-white/15"
    >
      <XIcon class="size-4" />
    </Button>
  </div>
</div>
