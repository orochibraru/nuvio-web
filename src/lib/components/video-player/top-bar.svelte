<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import InfoIcon from "@lucide/svelte/icons/info";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import { Button } from "#lib/components/ui/button/index.js";

	let {
		title,
		subheading = null,
		hasInfo,
		infoOpen,
		onToggleInfo,
		onBack,
		onSources,
	}: {
		title: string;
		subheading?: string | null;
		hasInfo: boolean;
		infoOpen: boolean;
		onToggleInfo: () => void;
		onBack?: () => void;
		onSources?: () => void;
	} = $props();
</script>

<div class="pointer-events-auto flex items-start gap-3 p-3 sm:p-4">
  {#if onBack}
    <Button
      variant="ghost"
      size="icon"
      aria-label="Back"
      onclick={onBack}
      class="shrink-0 rounded-full"
    >
      <ArrowLeftIcon class="size-5" />
    </Button>
  {/if}
  <div class="min-w-0 flex-1 pt-1">
    <p class="truncate font-semibold">{title}</p>
    {#if subheading}
      <p class="truncate text-sm text-muted-foreground">{subheading}</p>
    {/if}
  </div>
  {#if hasInfo}
    <Button
      variant={infoOpen ? "default" : "secondary"}
      size="sm"
      aria-pressed={infoOpen}
      onclick={onToggleInfo}
      class="shrink-0 gap-1.5 rounded-full font-medium [&_svg]:size-3.5"
    >
      <InfoIcon data-icon="inline-start" />Info
    </Button>
  {/if}
  {#if onSources}
    <Button
      variant="secondary"
      size="sm"
      onclick={onSources}
      class="shrink-0 gap-1.5 rounded-full font-medium [&_svg]:size-3.5"
    >
      <LayersIcon data-icon="inline-start" />Sources
    </Button>
  {/if}
</div>
