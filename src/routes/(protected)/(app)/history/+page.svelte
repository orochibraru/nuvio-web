<script lang="ts">
	import ClockIcon from "@lucide/svelte/icons/clock";
	import FilmIcon from "@lucide/svelte/icons/film";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import TvIcon from "@lucide/svelte/icons/tv";
	import EmptyState from "$lib/components/empty-state.svelte";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { sync } from "$lib/sync/store.svelte.js";

	pageTitle.set("Watch history");

	let { data } = $props();

	type Row = {
		id: string;
		contentId: string;
		type: "movie" | "series";
		title: string;
		season: number | null;
		episode: number | null;
		watchedAt: number;
	};

	const items = $derived<Row[]>(
		sync.authoritative
			? sync.history.map((record) => ({
					id: record.id,
					contentId: record.contentId,
					type: record.contentType,
					title: record.title,
					season: record.season,
					episode: record.episode,
					watchedAt: record.watchedAt,
				}))
			: data.items,
	);

	function dayLabel(ts: number): string {
		const date = new Date(ts);
		const now = new Date();
		const startOfToday = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
		).getTime();
		const dayMs = 86_400_000;
		if (ts >= startOfToday) {
			return "Today";
		}
		if (ts >= startOfToday - dayMs) {
			return "Yesterday";
		}
		if (ts >= startOfToday - 6 * dayMs) {
			return date.toLocaleDateString(undefined, { weekday: "long" });
		}
		return date.toLocaleDateString(undefined, {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
	}

	const groups = $derived.by(() => {
		const map = new Map<string, Row[]>();
		for (const item of items) {
			const label = dayLabel(item.watchedAt);
			const bucket = map.get(label);
			if (bucket) {
				bucket.push(item);
			} else {
				map.set(label, [item]);
			}
		}
		return [...map.entries()];
	});

	function episodeTag(season: number | null, episode: number | null): string {
		if (season == null || episode == null) {
			return "";
		}
		return ` · S${season}E${episode}`;
	}

	function remove(item: Row) {
		sync.deleteHistory({
			contentId: item.contentId,
			season: item.season,
			episode: item.episode,
		});
	}
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6">
	<h1 class="text-3xl font-bold tracking-tight">Watch history</h1>

	{#if groups.length === 0}
		<EmptyState
			icon={ClockIcon}
			title="Nothing watched yet"
			description="Titles you finish will be listed here, newest first."
		/>
	{:else}
		{#each groups as [label, items] (label)}
			<section class="flex flex-col gap-2">
				<h2 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					{label}
				</h2>
				<div class="overflow-hidden rounded-xl border border-border/60">
					{#each items as item, index (item.id)}
						<div
							class="group/row flex items-center gap-3 bg-card/40 p-3 transition-colors hover:bg-card"
							class:border-t={index > 0}
							class:border-border={index > 0}
						>
							<span
								class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-muted-foreground"
							>
								{#if item.type === "series"}
									<TvIcon class="size-4" />
								{:else}
									<FilmIcon class="size-4" />
								{/if}
							</span>
							<div class="min-w-0 flex-1">
								<a
									href={`/detail/${item.type}/${encodeURIComponent(item.contentId)}`}
									class="truncate text-sm font-medium transition-colors hover:text-primary"
								>
									{item.title}{episodeTag(item.season, item.episode)}
								</a>
								<p class="text-xs text-muted-foreground">
									{new Date(item.watchedAt).toLocaleTimeString(undefined, {
										hour: "numeric",
										minute: "2-digit",
									})}
								</p>
							</div>
							<button
								type="button"
								aria-label="Remove from history"
								onclick={() => remove(item)}
								class="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition group-hover/row:opacity-100 hover:bg-destructive/10 hover:text-destructive"
							>
								<Trash2Icon class="size-4" />
							</button>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</div>
