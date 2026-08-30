<script lang="ts">
	import CompassIcon from "@lucide/svelte/icons/compass";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { browseCatalog } from "$lib/addons/addons.remote";
	import type { MetaPreview } from "$lib/addons/index.js";
	import EmptyState from "$lib/components/empty-state.svelte";
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

	// Only disambiguate catalog pills by addon when more than one addon supplies them.
	const multipleAddons = $derived(
		new Set(data.catalogs.map((entry) => entry.addonId)).size > 1,
	);

	// Cinemeta reuses one catalog name ("Popular", "New"…) for both movie and
	// series, so pill labels collide. Suffix the repeats with their type.
	const catalogLabels = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const entry of data.catalogs) {
			counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
		}
		return new Map(
			data.catalogs.map((entry) => {
				const key = `${entry.addonId}|${entry.type}|${entry.id}`;
				if ((counts.get(entry.name) ?? 0) > 1) {
					const noun = entry.type === "series" ? "Series" : "Movies";
					return [key, `${entry.name} · ${noun}`];
				}
				return [key, entry.name];
			}),
		);
	});

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
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-bold tracking-tight">Discover</h1>
		<p class="text-sm text-muted-foreground">Browse every catalog your addons provide.</p>
	</div>

	{#if data.catalogs.length === 0}
		<EmptyState
			icon={CompassIcon}
			title="No catalogs available"
			description="Add a catalog addon to start browsing movies and series."
		>
			{#snippet actions()}
				<Button href="/addons" variant="outline">Manage addons</Button>
			{/snippet}
		</EmptyState>
	{:else if selected}
		<div class="no-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2 py-1">
			{#each data.catalogs as entry (`${entry.addonId}|${entry.type}|${entry.id}`)}
				{@const key = `${entry.addonId}|${entry.type}|${entry.id}`}
				<button
					type="button"
					onclick={() => selectCatalog(key)}
					class={cn(
						"shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition",
						key === data.selectedKey
							? "bg-primary text-primary-foreground shadow-sm"
							: "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
					)}
				>
					{catalogLabels.get(key) ?? entry.name}
					{#if multipleAddons}
						<span class="text-xs opacity-60">· {entry.addonName}</span>
					{/if}
				</button>
			{/each}
		</div>

		{#if selected.genres.length > 0}
			<div class="no-scrollbar -mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1">
				<button
					type="button"
					onclick={() => setGenre("")}
					class={cn(
						"shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition",
						!data.genre
							? "bg-secondary text-secondary-foreground"
							: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
					)}
				>
					All
				</button>
				{#each selected.genres as option (option)}
					<button
						type="button"
						onclick={() => setGenre(option)}
						class={cn(
							"shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition",
							data.genre === option
								? "bg-secondary text-secondary-foreground"
								: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
						)}
					>
						{option}
					</button>
				{/each}
			</div>
		{/if}

		{#if items.length === 0}
			<p class="py-10 text-center text-sm text-muted-foreground">Nothing in this catalog.</p>
		{:else}
			<MediaGrid {items} loading={loadingMore} skeletonCount={6} />
			{#if !exhausted && (data.firstPage?.metas.length ?? 0) > 0}
				<div class="flex justify-center pt-2">
					<Button variant="outline" disabled={loadingMore} onclick={loadMore}>
						{loadingMore ? "Loading…" : "Load more"}
					</Button>
				</div>
			{/if}
		{/if}
	{/if}
</div>
