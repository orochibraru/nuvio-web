<script lang="ts">
	import PlayIcon from "@lucide/svelte/icons/play";
	import StarIcon from "@lucide/svelte/icons/star";
	import type { MetaPreview } from "$lib/addons/index.js";
	import { cn } from "$lib/utils.js";

	let {
		item,
		progress,
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
		progress?: number;
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
	class={cn("group/poster flex flex-col gap-2.5", className)}
	data-sveltekit-preload-data="tap"
>
	<div
		class={cn(
			"relative overflow-hidden rounded-xl bg-muted ring-1 ring-white/5 transition-all duration-300 ease-out",
			"group-hover/poster:-translate-y-1 group-hover/poster:shadow-[0_24px_50px_-16px] group-hover/poster:shadow-black/70 group-hover/poster:ring-primary/60",
			aspect,
		)}
	>
		{#if item.poster && !broken}
			<img
				src={item.poster}
				alt={item.name}
				loading="lazy"
				onerror={() => (broken = true)}
				class="size-full object-cover transition-transform duration-500 ease-out group-hover/poster:scale-[1.06]"
			/>
		{:else}
			<div
				class="flex size-full items-center justify-center bg-linear-to-br from-muted to-background p-3 text-center text-sm font-medium text-muted-foreground"
			>
				{item.name}
			</div>
		{/if}

		<div
			class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-black/5 to-transparent opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100"
		></div>

		<div
			class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 group-hover/poster:opacity-100"
		>
			<span
				class="flex size-11 translate-y-1 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-transform duration-300 group-hover/poster:translate-y-0"
			>
				<PlayIcon class="size-5 translate-x-px fill-white" />
			</span>
		</div>

		{#if rating}
			<div
				title="IMDb rating"
				class="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur-md"
			>
				<StarIcon class="size-3 fill-amber-400 text-amber-400" />
				{rating}
			</div>
		{/if}

		{#if progress != null && progress > 0}
			<div class="absolute inset-x-0 bottom-0 h-1 bg-black/50">
				<div
					class="h-full rounded-r-full bg-primary"
					style={`width: ${Math.min(100, Math.max(0, progress * 100))}%`}
				></div>
			</div>
		{/if}
	</div>

	<div class="min-w-0">
		<p
			class="truncate text-sm font-medium text-foreground/90 transition-colors group-hover/poster:text-foreground"
		>
			{item.name}
		</p>
		{#if item.releaseInfo}
			<p class="truncate text-xs text-muted-foreground">{item.releaseInfo}</p>
		{/if}
	</div>
</a>
