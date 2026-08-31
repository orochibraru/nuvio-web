<script lang="ts">
	import ClockIcon from "@lucide/svelte/icons/clock";
	import FilmIcon from "@lucide/svelte/icons/film";
	import PlayIcon from "@lucide/svelte/icons/play";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import TvIcon from "@lucide/svelte/icons/tv";
	import { resolve } from "$app/paths";
	import EmptyState from "$lib/components/empty-state.svelte";
	import { watchHistory } from "$lib/history/history.remote";
	import type { HistoryRow } from "$lib/history/history-data.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { streamed } from "$lib/stream.svelte.js";
	import { sync } from "$lib/sync/store.svelte.js";

	pageTitle.set("Watch history");

	let { data } = $props();

	const rowsStream = streamed(() => data.items, [] as HistoryRow[]);
	const ssrItems = $derived(rowsStream.current);

	// Posters + clean titles: the local library mirror first, then the client-side
	// `watchHistory` query which enriches from the addons (the load ships raw
	// rows only, so a slow provider never stalls the page).
	const enrichQuery = watchHistory();
	const posters = $derived(
		new Map<string, string | null>([
			...sync.library.map(
				(entry) => [entry.contentId, entry.poster ?? null] as const,
			),
			...(enrichQuery.current ?? []).map(
				(item) => [item.contentId, item.poster ?? null] as const,
			),
		]),
	);
	const names = $derived(
		new Map<string, string>([
			...sync.library.map((entry) => [entry.contentId, entry.name] as const),
			...ssrItems.map((item) => [item.contentId, item.title] as const),
			...(enrichQuery.current ?? []).map(
				(item) => [item.contentId, item.title] as const,
			),
		]),
	);

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
					title:
						names.get(record.contentId) || record.title || record.contentId,
					season: record.season,
					episode: record.episode,
					watchedAt: record.watchedAt,
				}))
			: ssrItems,
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
		return `S${season}E${episode}`;
	}

	function watchHref(item: Row): string {
		const videoId =
			item.type === "series" && item.season != null && item.episode != null
				? `${item.contentId}:${item.season}:${item.episode}`
				: item.contentId;
		return resolve(`/player/${item.type}/${encodeURIComponent(videoId)}`);
	}

	function remove(item: Row) {
		sync.deleteHistory({
			contentId: item.contentId,
			season: item.season,
			episode: item.episode,
		});
	}
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-8">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-bold tracking-tight">Watch history</h1>
		<p class="text-sm text-muted-foreground">
			{items.length} title{items.length === 1 ? "" : "s"} watched, newest first
		</p>
	</div>

	{#if groups.length === 0 && !rowsStream.ready && !sync.authoritative}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each { length: 8 } as _skeleton, i (i)}
				<div class="skeleton h-24 rounded-xl"></div>
			{/each}
		</div>
	{:else if groups.length === 0}
		<EmptyState
			icon={ClockIcon}
			title="Nothing watched yet"
			description="Titles you finish will be listed here, newest first."
		/>
	{:else}
		{#each groups as [label, rows] (label)}
			<section class="flex flex-col gap-3">
				<h2 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					{label}
				</h2>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each rows as item (item.id)}
						<div
							class="group/row relative flex gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/40 p-2.5 transition-colors hover:border-primary/40 hover:bg-card"
						>
							<a
								href={resolve(`/detail/${item.type}/${encodeURIComponent(item.contentId)}`)}
								class="relative aspect-2/3 w-16 shrink-0 overflow-hidden rounded-lg bg-muted"
							>
								<span class="absolute inset-0 flex items-center justify-center bg-linear-to-br from-muted to-background">
									{#if item.type === "series"}
										<TvIcon class="size-5 text-muted-foreground/40" />
									{:else}
										<FilmIcon class="size-5 text-muted-foreground/40" />
									{/if}
								</span>
								{#if posters.get(item.contentId)}
									<img
										src={posters.get(item.contentId)}
										alt=""
										loading="lazy"
										decoding="async"
										class="relative size-full object-cover"
									/>
								{/if}
							</a>

							<div class="flex min-w-0 flex-1 flex-col justify-center gap-1">
								<a
									href={resolve(`/detail/${item.type}/${encodeURIComponent(item.contentId)}`)}
									class="line-clamp-2 text-sm font-semibold transition-colors hover:text-primary"
								>
									{item.title}
								</a>
								<div class="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
									{#if episodeTag(item.season, item.episode)}
										<span class="rounded bg-foreground/5 px-1 py-px font-medium text-foreground/70">
											{episodeTag(item.season, item.episode)}
										</span>
									{/if}
									<span>
										{new Date(item.watchedAt).toLocaleTimeString(undefined, {
											hour: "numeric",
											minute: "2-digit",
										})}
									</span>
								</div>
								<a
									href={watchHref(item)}
									class="mt-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-primary transition hover:underline"
								>
									<PlayIcon class="size-3 fill-current" />
									{item.type === "series" ? "Rewatch episode" : "Rewatch"}
								</a>
							</div>

							<button
								type="button"
								aria-label="Remove from history"
								onclick={() => remove(item)}
								class="absolute top-2 right-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition group-hover/row:opacity-100 hover:bg-destructive/10 hover:text-destructive"
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
