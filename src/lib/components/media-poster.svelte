<script lang="ts">
	import StarIcon from "@lucide/svelte/icons/star";
	import type { MetaPreview } from "$lib/addons/index.js";
	import { cn } from "$lib/utils.js";

	let {
		item,
		class: className,
	}: {
		item: Pick<
			MetaPreview,
			| "id"
			| "type"
			| "name"
			| "poster"
			| "posterShape"
			| "releaseInfo"
			| "imdbRating"
		>;
		class?: string;
	} = $props();

	let broken = $state(false);

	const aspect = $derived(
		item.posterShape === "landscape"
			? "aspect-video"
			: item.posterShape === "square"
				? "aspect-square"
				: "aspect-2/3",
	);
	const rating = $derived(
		typeof item.imdbRating === "number"
			? item.imdbRating.toFixed(1)
			: item.imdbRating || null,
	);
</script>

<a
	href={`/detail/${item.type}/${encodeURIComponent(item.id)}`}
	class={cn("group flex flex-col gap-2", className)}
	data-sveltekit-preload-data="tap"
>
	<div class={cn("relative overflow-hidden rounded-lg bg-muted", aspect)}>
		{#if item.poster && !broken}
			<img
				src={item.poster}
				alt={item.name}
				loading="lazy"
				onerror={() => (broken = true)}
				class="size-full object-cover transition duration-200 group-hover:scale-105"
			/>
		{:else}
			<div class="flex size-full items-center justify-center p-3 text-center text-sm text-muted-foreground">
				{item.name}
			</div>
		{/if}
		{#if rating}
			<div
				class="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white"
			>
				<StarIcon class="size-3 fill-yellow-400 text-yellow-400" />
				{rating}
			</div>
		{/if}
	</div>
	<div class="min-w-0">
		<p class="truncate text-sm font-medium">{item.name}</p>
		{#if item.releaseInfo}
			<p class="truncate text-xs text-muted-foreground">{item.releaseInfo}</p>
		{/if}
	</div>
</a>
