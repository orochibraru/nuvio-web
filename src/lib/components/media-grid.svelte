<script lang="ts">
	import type { MetaPreview } from "$lib/addons/index.js";
	import MediaPoster from "./media-poster.svelte";

	let {
		items,
		loading = false,
		skeletonCount = 12,
	}: {
		items: MetaPreview[];
		loading?: boolean;
		skeletonCount?: number;
	} = $props();
</script>

<div
	class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
>
	{#each items as item (`${item.type}:${item.id}`)}
		<MediaPoster {item} />
	{/each}
	{#if loading}
		{#each { length: skeletonCount } as _skeleton, index (index)}
			<div class="flex flex-col gap-2">
				<div class="aspect-2/3 animate-pulse rounded-lg bg-muted"></div>
				<div class="h-4 w-3/4 animate-pulse rounded bg-muted"></div>
			</div>
		{/each}
	{/if}
</div>
