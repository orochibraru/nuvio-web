<script lang="ts">
	import BookmarkIcon from "@lucide/svelte/icons/bookmark";
	import XIcon from "@lucide/svelte/icons/x";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import EmptyState from "$lib/components/empty-state.svelte";
	import MediaPoster from "$lib/components/media-poster.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { streamed } from "$lib/stream.svelte.js";
	import { sync } from "$lib/sync/store.svelte.js";
	import { cn } from "$lib/utils.js";

	pageTitle.set("Library");

	let { data } = $props();

	// Filter + sort live in the URL so they survive back/forward and are shareable.
	const filters = [
		{ value: "all", label: "All" },
		{ value: "movie", label: "Movies" },
		{ value: "series", label: "Series" },
		{ value: "watched", label: "Watched" },
		{ value: "unwatched", label: "Unwatched" },
	] as const;
	type Filter = (typeof filters)[number]["value"];
	const filter = $derived<Filter>(
		(filters.find((f) => f.value === page.url.searchParams.get("filter"))
			?.value ?? "all") as Filter,
	);

	const sorts = [
		{ value: "added", label: "Recently added" },
		{ value: "name", label: "A–Z" },
		{ value: "rating", label: "Top rated" },
	] as const;
	type Sort = (typeof sorts)[number]["value"];
	const sort = $derived<Sort>(
		(sorts.find((s) => s.value === page.url.searchParams.get("sort"))?.value ??
			"added") as Sort,
	);

	function setParam(key: string, value: string, fallback: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (value === fallback) {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		const query = params.toString();
		void goto(query ? `?${query}` : "?", { keepFocus: true, noScroll: true });
	}

	type GridItem = {
		id: string;
		type: "movie" | "series";
		name: string;
		poster?: string;
		releaseInfo?: string;
		imdbRating?: number;
	};

	// The load streams these in (unawaited) so navigation isn't blocked; the
	// local store takes over once it has hydrated. Keep showing the streamed
	// payload while the store is authoritative-but-empty (a snapshot pull that
	// fails / returns nothing shouldn't blank a library the server just sent).
	const itemsStream = streamed(() => data.items, [] as GridItem[]);
	const progressStream = streamed(
		() => data.progress,
		{} as Record<string, number>,
	);
	const ssrItems = $derived<GridItem[]>(itemsStream.current);
	const useStore = $derived(
		sync.authoritative && (sync.library.length > 0 || ssrItems.length === 0),
	);
	const items = $derived<GridItem[]>(
		useStore
			? sync.library.map((record) => ({
					id: record.contentId,
					type: record.contentType,
					name: record.name,
					poster: record.poster ?? undefined,
					releaseInfo: record.releaseInfo ?? undefined,
					imdbRating: record.imdbRating ?? undefined,
				}))
			: ssrItems,
	);
	const progress = $derived(
		useStore ? sync.libraryProgress : progressStream.current,
	);

	const shown = $derived.by(() => {
		let list = items;
		if (filter === "movie" || filter === "series") {
			list = list.filter((item) => item.type === filter);
		} else if (filter === "watched") {
			list = list.filter((item) => (progress[item.id] ?? 0) >= 0.9);
		} else if (filter === "unwatched") {
			list = list.filter((item) => (progress[item.id] ?? 0) < 0.9);
		}
		if (sort === "name") {
			list = [...list].sort((a, b) => a.name.localeCompare(b.name));
		} else if (sort === "rating") {
			list = [...list].sort(
				(a, b) => (b.imdbRating ?? 0) - (a.imdbRating ?? 0),
			);
		}
		return list;
	});

	function remove(item: GridItem) {
		sync.toggleLibrary({
			contentId: item.id,
			contentType: item.type,
			remove: true,
		});
	}
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-1">
			<h1 class="text-3xl font-bold tracking-tight">Library</h1>
			<p class="text-sm text-muted-foreground">
				{items.length} title{items.length === 1 ? "" : "s"} saved
			</p>
		</div>
		<div class="flex items-center gap-2">
			<div class="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-foreground/5 p-1">
				{#each filters as option (option.value)}
					<button
						type="button"
						onclick={() => setParam("filter", option.value, "all")}
						class={cn(
							"shrink-0 rounded-full px-3 py-1 text-sm font-medium transition",
							filter === option.value
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{option.label}
					</button>
				{/each}
			</div>
			<button
				type="button"
				onclick={() => {
					const next = (sorts.findIndex((s) => s.value === sort) + 1) % sorts.length;
					setParam("sort", sorts[next].value, "added");
				}}
				class="rounded-full bg-foreground/5 px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
			>
				{sorts.find((s) => s.value === sort)?.label}
			</button>
		</div>
	</div>

	{#if shown.length === 0 && items.length > 0}
		<p class="py-16 text-center text-sm text-muted-foreground">
			No titles match this filter.
		</p>
	{:else if shown.length === 0 && !itemsStream.ready && !sync.authoritative}
		<div
			class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
		>
			{#each { length: 12 } as _skeleton, i (i)}
				<div class="skeleton aspect-2/3 rounded-xl"></div>
			{/each}
		</div>
	{:else if shown.length === 0}
		<EmptyState
			icon={BookmarkIcon}
			title="Your library is empty"
			description="Add movies and series from any detail page and they'll show up here."
		>
			{#snippet actions()}
				<Button href={resolve("/discover")} variant="outline">Browse catalogs</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div
			class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
		>
			{#each shown as item (`${item.type}:${item.id}`)}
				<div class="group relative">
					<MediaPoster {item} progress={progress[item.id]} />
					<button
						type="button"
						aria-label="Remove from library"
						onclick={() => remove(item)}
						class="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 hover:bg-black/90"
					>
						<XIcon class="size-4" />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
