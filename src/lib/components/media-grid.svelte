<script lang="ts">
	import { fly } from "svelte/transition";
	import type { MetaPreview } from "#lib/addons/index.js";
	import { reduced } from "#lib/motion.js";
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
	class="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
>
	{#each items as item, i (`${item.type}:${item.id}`)}
		<div
			in:fly={reduced({ y: 10, duration: 240, delay: Math.min(i, 17) * 20 })}
		>
			<MediaPoster {item} class="content-auto" />
		</div>
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
