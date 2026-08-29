<script lang="ts">
	import BookmarkIcon from "@lucide/svelte/icons/bookmark";
	import XIcon from "@lucide/svelte/icons/x";
	import EmptyState from "$lib/components/empty-state.svelte";
	import MediaPoster from "$lib/components/media-poster.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { toggleLibrary } from "$lib/library/library.remote";
	import { cn } from "$lib/utils.js";

	let { data } = $props();

	let filter = $state<"all" | "movie" | "series">("all");
	let sort = $state<"added" | "name">("added");
	let removed = $state<string[]>([]);

	const shown = $derived.by(() => {
		let list = data.items.filter(
			(item) => !removed.includes(`${item.type}:${item.id}`),
		);
		if (filter !== "all") {
			list = list.filter((item) => item.type === filter);
		}
		if (sort === "name") {
			list = [...list].sort((a, b) => a.name.localeCompare(b.name));
		}
		return list;
	});

	const filters: Array<{ value: typeof filter; label: string }> = [
		{ value: "all", label: "All" },
		{ value: "movie", label: "Movies" },
		{ value: "series", label: "Series" },
	];

	async function remove(item: (typeof data.items)[number]) {
		const key = `${item.type}:${item.id}`;
		removed = [...removed, key];
		try {
			await toggleLibrary({
				content_id: item.id,
				content_type: item.type === "series" ? "series" : "movie",
				remove: true,
			});
		} catch {
			removed = removed.filter((entry) => entry !== key);
		}
	}
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-1">
			<h1 class="text-3xl font-bold tracking-tight">Library</h1>
			<p class="text-sm text-muted-foreground">
				{data.items.length} title{data.items.length === 1 ? "" : "s"} saved
			</p>
		</div>
		<div class="flex items-center gap-2">
			<div class="flex gap-1 rounded-full bg-foreground/5 p-1">
				{#each filters as option (option.value)}
					<button
						type="button"
						onclick={() => (filter = option.value)}
						class={cn(
							"rounded-full px-3 py-1 text-sm font-medium transition",
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
				onclick={() => (sort = sort === "added" ? "name" : "added")}
				class="rounded-full bg-foreground/5 px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
			>
				{sort === "added" ? "Recently added" : "A–Z"}
			</button>
		</div>
	</div>

	{#if shown.length === 0}
		<EmptyState
			icon={BookmarkIcon}
			title="Your library is empty"
			description="Add movies and series from any detail page and they'll show up here."
		>
			{#snippet actions()}
				<Button href="/discover" variant="outline">Browse catalogs</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div
			class="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
		>
			{#each shown as item (`${item.type}:${item.id}`)}
				<div class="group relative">
					<MediaPoster {item} />
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
