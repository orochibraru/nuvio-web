<script lang="ts">
	import XIcon from "@lucide/svelte/icons/x";
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
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Library</h1>
		<div class="flex items-center gap-3">
			<div class="flex gap-1">
				{#each filters as option (option.value)}
					<button
						type="button"
						onclick={() => (filter = option.value)}
						class={cn(
							"rounded-md px-2.5 py-1 text-sm transition",
							filter === option.value
								? "bg-secondary text-secondary-foreground"
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
				class="text-sm text-muted-foreground hover:text-foreground"
			>
				Sort: {sort === "added" ? "Recently added" : "Name"}
			</button>
		</div>
	</div>

	{#if shown.length === 0}
		<div class="rounded-lg border border-border p-8 text-center">
			<p class="font-medium">Your library is empty</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Add titles from a detail page and they show up here.
			</p>
			<Button href="/discover" variant="outline" class="mt-4">Browse</Button>
		</div>
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
