<script lang="ts">
	import type { MetaPreview } from "$lib/addons/index.js";
	import MediaPoster from "./media-poster.svelte";

	let {
		title,
		items,
		href,
	}: { title: string; items: MetaPreview[]; href?: string } = $props();
</script>

{#if items.length > 0}
	<section class="flex flex-col gap-3">
		<div class="flex items-baseline justify-between">
			<h2 class="text-lg font-semibold tracking-tight">{title}</h2>
			{#if href}
				<a {href} class="text-sm text-muted-foreground transition hover:text-foreground">
					See all
				</a>
			{/if}
		</div>
		<div class="-mx-2 flex gap-4 overflow-x-auto px-2 pb-2 scrollbar-thin">
			{#each items as item (`${item.type}:${item.id}`)}
				<MediaPoster {item} class="w-36 shrink-0" />
			{/each}
		</div>
	</section>
{/if}
