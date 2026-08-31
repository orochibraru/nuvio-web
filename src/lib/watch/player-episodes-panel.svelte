<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import PlayIcon from "@lucide/svelte/icons/play";
	import TvIcon from "@lucide/svelte/icons/tv";
	import XIcon from "@lucide/svelte/icons/x";
	import { cn } from "$lib/utils.js";

	interface Episode {
		videoId: string;
		season: number;
		episode: number;
		title: string;
		overview: string | null;
		thumbnail: string | null;
		released: string | null;
		rating: string | null;
	}

	let {
		episodes,
		currentVideoId,
		progress = {},
		onClose,
		onSelect,
	}: {
		episodes: Episode[];
		currentVideoId: string;
		progress?: Record<string, { fraction: number; completed: boolean }>;
		onClose: () => void;
		onSelect: (videoId: string) => void;
	} = $props();

	const seasons = $derived(
		[...new Set(episodes.map((entry) => entry.season))].sort((a, b) => a - b),
	);

	const currentSeason = $derived(
		episodes.find((entry) => entry.videoId === currentVideoId)?.season ??
			seasons[0] ??
			1,
	);

	let activeSeason = $state<number | null>(null);
	$effect(() => {
		if (activeSeason === null || !seasons.includes(activeSeason)) {
			activeSeason = currentSeason;
		}
	});

	const shown = $derived(
		episodes.filter((entry) => entry.season === activeSeason),
	);

	function airDate(released: string | null): string | null {
		if (!released) {
			return null;
		}
		const date = new Date(released);
		return Number.isNaN(date.getTime())
			? null
			: date.toLocaleDateString(undefined, {
					day: "numeric",
					month: "short",
					year: "numeric",
				});
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<button
	type="button"
	aria-label="Close episodes"
	onclick={onClose}
	class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
></button>

<aside
	aria-label="Episodes"
	class="fixed inset-y-0 right-0 z-50 flex w-full max-w-105 flex-col border-l border-white/10 bg-neutral-950 text-white"
>
	<header class="flex items-center justify-between border-b border-white/10 p-4">
		<p class="text-sm font-semibold">Episodes</p>
		<button
			type="button"
			aria-label="Close"
			onclick={onClose}
			class="flex size-8 items-center justify-center rounded-full transition hover:bg-white/10"
		>
			<XIcon class="size-4" />
		</button>
	</header>

	{#if seasons.length > 1}
		<div class="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-white/10 p-3">
			{#each seasons as season (season)}
				<button
					type="button"
					onclick={() => (activeSeason = season)}
					class={cn(
						"shrink-0 rounded-full px-3 py-1 text-xs font-medium transition",
						activeSeason === season
							? "bg-primary text-primary-foreground"
							: "bg-white/5 text-white/70 hover:text-white",
					)}
				>
					Season {season}
				</button>
			{/each}
		</div>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
		{#each shown as entry (entry.videoId)}
			{@const isCurrent = entry.videoId === currentVideoId}
			{@const p = progress[entry.videoId]}
			{@const date = airDate(entry.released)}
			<button
				type="button"
				onclick={() => onSelect(entry.videoId)}
				class={cn(
					"group/ep flex w-full gap-3 rounded-lg p-2 text-left transition",
					isCurrent ? "bg-white/10" : "hover:bg-white/5",
				)}
			>
				<div class="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-white/5">
					<span class="absolute inset-0 flex items-center justify-center">
						<TvIcon class="size-5 text-white/20" />
					</span>
					{#if entry.thumbnail}
						<img
							src={entry.thumbnail}
							alt=""
							loading="lazy"
							class="relative size-full object-cover"
						/>
					{/if}
					<span
						class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover/ep:opacity-100"
					>
						<PlayIcon class="size-6 fill-white" />
					</span>
					{#if p && p.fraction > 0.02 && !p.completed}
						<span class="absolute inset-x-0 bottom-0 h-0.5 bg-white/25">
							<span
								class="block h-full bg-primary"
								style={`width: ${Math.min(100, p.fraction * 100)}%`}
							></span>
						</span>
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<p class="flex items-center gap-1.5 text-sm font-medium">
						<span class="text-white/50">{entry.episode}.</span>
						<span class="truncate">{entry.title}</span>
						{#if p?.completed}
							<CheckIcon class="size-3.5 shrink-0 text-primary" />
						{/if}
						{#if isCurrent}
							<span class="shrink-0 rounded bg-primary/20 px-1 text-[10px] font-semibold text-primary">
								Now
							</span>
						{/if}
					</p>
					<div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-white/50">
						{#if entry.rating}<span>★ {entry.rating}</span>{/if}
						{#if date}<span>{date}</span>{/if}
					</div>
					{#if entry.overview}
						<p class="mt-1 line-clamp-2 text-xs text-white/60">{entry.overview}</p>
					{/if}
				</div>
			</button>
		{/each}
	</div>
</aside>
