<script lang="ts">
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { Button } from "#lib/components/ui/button/index.js";

	let {
		onSources,
		onDismiss,
	}: {
		onSources?: () => void;
		onDismiss: () => void;
	} = $props();
</script>

<div
  class="absolute inset-x-4 bottom-24 z-40 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl bg-black/80 px-4 py-3 text-sm text-white ring-1 ring-white/15 backdrop-blur-md"
>
  <div class="flex items-start gap-2.5">
    <TriangleAlertIcon class="mt-0.5 size-5 shrink-0" />
    <div class="min-w-0">
      <p class="font-medium">The video may not be playing</p>
      <p class="text-white/70">
        This browser might not decode this source's video codec. If the
        picture looks fine, dismiss this.
      </p>
    </div>
  </div>
  <div class="flex shrink-0 items-center gap-1.5">
    {#if onSources}
      <Button size="xs" onclick={onSources}>Other sources</Button>
    {/if}
    <Button size="xs" variant="secondary" onclick={onDismiss}>
      Looks fine
    </Button>
  </div>
</div>
