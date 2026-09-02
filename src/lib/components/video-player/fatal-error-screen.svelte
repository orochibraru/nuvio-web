<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { Button } from "#lib/components/ui/button/index.js";
	import { externalPlayerHandoff } from "#lib/watch/external-player.js";
	import { browser } from "$app/env";

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

	// A deep link where the OS has one (mobile), otherwise copying the URL —
	// desktop registers no player scheme.
	const handoff = $derived(
		browser
			? externalPlayerHandoff({ url: externalUrl }, navigator.userAgent)
			: null,
	);

	async function playExternally() {
		if (handoff?.kind !== "copy") {
			return;
		}
		await copyExternal();
	}

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
			// clipboard blocked : the deep link (where there is one) still is
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
      {#if handoff?.kind === "link"}
        <Button variant="secondary" href={handoff.href}>
          <ExternalLinkIcon data-icon="inline-start" /> Play in external player
        </Button>
      {:else if handoff?.kind === "copy"}
        <Button variant="secondary" onclick={playExternally}>
          <ExternalLinkIcon data-icon="inline-start" /> Play in external player
        </Button>
      {/if}
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
