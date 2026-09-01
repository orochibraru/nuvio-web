<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { Button } from "#lib/components/ui/button/index.js";

	let {
		message,
		externalUrl = null,
		onSources,
		onBack,
	}: {
		message: string;
		/** Direct stream URL for the external-player handoff. */
		externalUrl?: string | null;
		onSources?: () => void;
		onBack?: () => void;
	} = $props();

	let linkCopied = $state(false);
	async function copyExternal() {
		if (!externalUrl) {
			return;
		}
		try {
			await navigator.clipboard.writeText(externalUrl);
			linkCopied = true;
			setTimeout(() => {
				linkCopied = false;
			}, 2000);
		} catch {
			// clipboard blocked — the VLC link is still there
		}
	}
</script>

<div
  class="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center text-white"
>
  <TriangleAlertIcon class="size-8 text-destructive" />
  <h2 class="text-lg font-semibold">Can't play this source</h2>
  <p class="max-w-sm text-sm text-white/70">{message}</p>
  <div class="mt-1 flex flex-wrap items-center justify-center gap-2">
    {#if onSources}
      <Button onclick={onSources}>
        <LayersIcon data-icon="inline-start" /> Choose another source
      </Button>
    {/if}
    {#if externalUrl}
      <Button variant="secondary" href={`vlc://${externalUrl}`}>
        <ExternalLinkIcon data-icon="inline-start" /> Open in VLC
      </Button>
      <Button variant="ghost" onclick={copyExternal}>
        {#if linkCopied}
          <CheckIcon data-icon="inline-start" /> Copied
        {:else}
          <CopyIcon data-icon="inline-start" /> Copy link
        {/if}
      </Button>
    {/if}
    {#if onBack}
      <Button variant="secondary" onclick={onBack}>Back</Button>
    {/if}
  </div>
</div>
