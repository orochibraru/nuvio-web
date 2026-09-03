<script lang="ts">
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import { fly } from "svelte/transition";
	import type { MetaPreview } from "#lib/addons/index.js";
	import ScrollRail from "#lib/components/layout/scroll-rail.svelte";
	import { reduced } from "#lib/core/motion.js";
	import MediaPoster from "./poster.svelte";

	let {
		title,
		items,
		href,
	}: { title: string; items: MetaPreview[]; href?: string } = $props();
</script>

{#if items.length > 0}
	<section class="group/row flex flex-col gap-3">
		<div class="flex items-baseline justify-between gap-4">
			<h2 class="text-xl font-semibold tracking-tight">{title}</h2>
			{#if href}
				<a
					{href}
					class="flex shrink-0 items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					See all
					<ChevronRightIcon class="size-4" />
				</a>
			{/if}
		</div>

		<ScrollRail label={title} trackClass="snap-x scroll-px-2 gap-4 pt-1 pb-2">
			{#each items as item, i (`${item.type}:${item.id}`)}
				<div
					class="w-40 shrink-0 snap-start content-auto sm:w-44"
					in:fly={reduced({
						y: 10,
						duration: 240,
						delay: Math.min(i, 10) * 30,
					})}
				>
					<MediaPoster {item} class="w-full" />
				</div>
			{/each}
		</ScrollRail>
	</section>
{/if}
