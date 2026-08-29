<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import type { MetaPreview } from "$lib/addons/index.js";
	import { cn } from "$lib/utils.js";
	import MediaPoster from "./media-poster.svelte";

	let {
		title,
		items,
		href,
	}: { title: string; items: MetaPreview[]; href?: string } = $props();

	let track = $state<HTMLDivElement | null>(null);
	let atStart = $state(true);
	let atEnd = $state(false);

	function sync() {
		if (!track) {
			return;
		}
		atStart = track.scrollLeft <= 8;
		atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
	}

	function nudge(direction: 1 | -1) {
		if (!track) {
			return;
		}
		track.scrollBy({
			left: direction * track.clientWidth * 0.8,
			behavior: "smooth",
		});
	}

	$effect(() => {
		void items;
		sync();
	});
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

		<div class="relative -mx-2">
			<div
				bind:this={track}
				onscroll={sync}
				class="no-scrollbar flex snap-x scroll-px-2 gap-4 overflow-x-auto scroll-smooth px-2 pt-1 pb-2"
			>
				{#each items as item (`${item.type}:${item.id}`)}
					<MediaPoster {item} class="w-40 shrink-0 snap-start sm:w-44" />
				{/each}
			</div>

			<div
				class={cn(
					"pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-background to-transparent transition-opacity duration-200",
					atStart && "opacity-0",
				)}
			></div>
			<div
				class={cn(
					"pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-background to-transparent transition-opacity duration-200",
					atEnd && "opacity-0",
				)}
			></div>

			<button
				type="button"
				aria-label="Scroll left"
				onclick={() => nudge(-1)}
				class={cn(
					"absolute top-1/2 left-1 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 ring-1 ring-border backdrop-blur-md transition-opacity duration-200 hover:bg-background sm:flex group-hover/row:opacity-100",
					atStart && "opacity-0!",
				)}
			>
				<ChevronLeftIcon class="size-5" />
			</button>
			<button
				type="button"
				aria-label="Scroll right"
				onclick={() => nudge(1)}
				class={cn(
					"absolute top-1/2 right-1 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 ring-1 ring-border backdrop-blur-md transition-opacity duration-200 hover:bg-background sm:flex group-hover/row:opacity-100",
					atEnd && "opacity-0!",
				)}
			>
				<ChevronRightIcon class="size-5" />
			</button>
		</div>
	</section>
{/if}
