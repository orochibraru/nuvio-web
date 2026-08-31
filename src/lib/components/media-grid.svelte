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
	class="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-8"
>
	{#each items as item (`${item.type}:${item.id}`)}
		<MediaPoster {item} />
	{/each}
	{#if loading}
		{#each { length: skeletonCount } as _skeleton, index (index)}
			<div class="flex flex-col gap-2.5">
				<div class="skeleton aspect-2/3 rounded-xl"></div>
				<div class="skeleton h-3.5 w-3/4 rounded"></div>
				<div class="skeleton h-3 w-2/5 rounded"></div>
			</div>
		{/each}
	{/if}
</div>
