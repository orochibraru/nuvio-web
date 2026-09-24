<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import InfoIcon from "@lucide/svelte/icons/info";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/i18n/index.js";
	import { cn } from "#lib/utils.js";

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
      aria-label={m.common_back()}
      title={m.common_back()}
      onclick={onBack}
      class="shrink-0 rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-white/20 dark:hover:bg-white/20 hover:text-white"
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
      variant="ghost"
      size="sm"
      aria-pressed={infoOpen}
      title={m.player_info_hint()}
      onclick={onToggleInfo}
      class={cn(
        "shrink-0 gap-1.5 rounded-full font-medium [&_svg]:size-3.5",
        infoOpen
          ? "bg-white text-black hover:bg-white/85 hover:text-black dark:hover:bg-white/85"
          : "bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-white/20 dark:hover:bg-white/20 hover:text-white",
      )}
    >
      <InfoIcon data-icon="inline-start" />{m.player_info()}
    </Button>
  {/if}
  {#if onSources}
    <Button
      variant="ghost"
      size="sm"
      title={m.player_pick_source_hint()}
      onclick={onSources}
      class="shrink-0 gap-1.5 rounded-full font-medium bg-white/10 text-white ring-1 ring-white/15 backdrop-blur-xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] hover:bg-white/20 dark:hover:bg-white/20 hover:text-white [&_svg]:size-3.5"
    >
      <LayersIcon data-icon="inline-start" />{m.common_sources()}
    </Button>
  {/if}
</div>
