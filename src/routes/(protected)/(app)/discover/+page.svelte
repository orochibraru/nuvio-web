<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { browseCatalog } from "$lib/addons/addons.remote";
	import type { MetaPreview } from "$lib/addons/index.js";
	import MediaGrid from "$lib/components/media-grid.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn } from "$lib/utils.js";

	let { data } = $props();

	const selected = $derived(
		data.catalogs.find(
			(entry) =>
				`${entry.addonId}|${entry.type}|${entry.id}` === data.selectedKey,
		),
	);

	let more = $state<MetaPreview[]>([]);
	let loadingMore = $state(false);
	let exhausted = $state(false);

	// reset appended pages whenever the load re-runs (catalog / genre change)
	$effect(() => {
		void data.firstPage;
		more = [];
		exhausted = false;
	});

	const items = $derived([...(data.firstPage?.metas ?? []), ...more]);

	function navigate(params: URLSearchParams) {
		goto(`?${params}`, { keepFocus: true, noScroll: true });
	}

	function selectCatalog(key: string) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set("c", key);
		params.delete("g");
		navigate(params);
	}

	function setGenre(value: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (value) {
			params.set("g", value);
		} else {
			params.delete("g");
		}
		navigate(params);
	}

	async function loadMore() {
		if (!selected || loadingMore) {
			return;
		}
		loadingMore = true;
		try {
			const next = await browseCatalog({
				addonId: selected.addonId,
				type: selected.type,
				id: selected.id,
				genre: data.genre || undefined,
				skip: items.length,
			});
			if (next.metas.length === 0) {
				exhausted = true;
			}
			more = [...more, ...next.metas];
		} finally {
			loadingMore = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	<h1 class="text-2xl font-semibold tracking-tight">Discover</h1>

	{#if data.catalogs.length === 0}
		<div class="rounded-lg border border-border p-8 text-center">
			<p class="font-medium">No catalogs available</p>
			<p class="mt-1 text-sm text-muted-foreground">Add a catalog addon to start browsing.</p>
			<Button href="/addons" variant="outline" class="mt-4">Manage addons</Button>
		</div>
	{:else if selected}
		<div class="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 scrollbar-thin">
			{#each data.catalogs as entry (`${entry.addonId}|${entry.type}|${entry.id}`)}
				{@const key = `${entry.addonId}|${entry.type}|${entry.id}`}
				<button
					type="button"
					onclick={() => selectCatalog(key)}
					class={cn(
						"shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition",
						key === data.selectedKey
							? "border-foreground bg-foreground text-background"
							: "border-border text-muted-foreground hover:text-foreground",
					)}
				>
					{entry.name}
					<span class="text-xs opacity-60">· {entry.addonName}</span>
				</button>
			{/each}
		</div>

		{#if selected.genres.length > 0}
			<div class="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 scrollbar-thin">
				<button
					type="button"
					onclick={() => setGenre("")}
					class={cn(
						"shrink-0 rounded-full px-2.5 py-1 text-xs transition",
						!data.genre
							? "bg-secondary text-secondary-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					All
				</button>
				{#each selected.genres as option (option)}
					<button
						type="button"
						onclick={() => setGenre(option)}
						class={cn(
							"shrink-0 rounded-full px-2.5 py-1 text-xs whitespace-nowrap transition",
							data.genre === option
								? "bg-secondary text-secondary-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{option}
					</button>
				{/each}
			</div>
		{/if}

		{#if items.length === 0}
			<p class="text-sm text-muted-foreground">Nothing here.</p>
		{:else}
			<MediaGrid {items} loading={loadingMore} skeletonCount={6} />
			{#if !exhausted && (data.firstPage?.metas.length ?? 0) > 0}
				<div class="flex justify-center">
					<Button variant="outline" disabled={loadingMore} onclick={loadMore}>Load more</Button>
				</div>
			{/if}
		{/if}
	{/if}
</div>
