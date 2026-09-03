<script lang="ts">
	import BookmarkIcon from "@lucide/svelte/icons/bookmark";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import XIcon from "@lucide/svelte/icons/x";
	import { fly } from "svelte/transition";
	import { toast } from "svelte-sonner";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import MediaPoster from "#lib/components/media/poster.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { reduced } from "#lib/core/motion.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { cn } from "#lib/utils.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

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
		const params = new URLSearchParams(page.url.search);
		if (value === fallback) {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		const query = params.toString();
		void goto(query ? `?${query}` : "?", { reset: false });
	}

	interface GridItem {
		id: string;
		type: "movie" | "series";
		name: string;
		poster?: string;
		releaseInfo?: string;
		imdbRating?: number;
	}

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
		toast(`Removed ${item.name}`, {
			action: {
				label: "Undo",
				onClick: () =>
					sync.toggleLibrary({
						contentId: item.id,
						contentType: item.type,
						remove: false,
						name: item.name,
						poster: item.poster,
					}),
			},
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
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="flex items-center gap-1 rounded-full bg-foreground/5 px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
				>
					{sorts.find((s) => s.value === sort)?.label}
					<ChevronDownIcon class="size-3.5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.RadioGroup
						value={sort}
						onValueChange={(value) => setParam("sort", value, "added")}
					>
						{#each sorts as option (option.value)}
							<DropdownMenu.RadioItem value={option.value}>
								{option.label}
							</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	{#if shown.length === 0 && items.length > 0}
		<p class="py-16 text-center text-sm text-muted-foreground">
			No titles match this filter.
		</p>
	{:else if shown.length === 0 && !itemsStream.ready && !sync.authoritative}
		<div
			class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
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
				<Button href={resolve('discover')} variant="outline">Browse catalogs</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div
			class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
		>
			{#each shown as item, i (`${item.type}:${item.id}`)}
				<div
					class="group relative content-auto"
					in:fly={reduced({ y: 10, duration: 240, delay: Math.min(i, 17) * 20 })}
				>
					<MediaPoster item={item} progress={progress[item.id]} />
					<button
						type="button"
						aria-label="Remove from library"
						onclick={() => remove(item)}
						class="absolute top-1.5 right-1.5 flex size-9 items-center justify-center rounded-full bg-black/70 text-white transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 hover:bg-black/90"
					>
						<XIcon class="size-4" />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
