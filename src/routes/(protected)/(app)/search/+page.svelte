<script lang="ts">
	import ClockIcon from "@lucide/svelte/icons/clock";
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";
	import { untrack } from "svelte";
	import { afterNavigate, goto } from "$app/navigation";
	import { page } from "$app/state";
	import { homeRows, searchCatalogs } from "$lib/addons/addons.remote";
	import MediaGrid from "$lib/components/media-grid.svelte";
	import MediaRow from "$lib/components/media-row.svelte";
	import { Input } from "$lib/components/ui/input/index.js";
	import { searchHistory } from "$lib/search-history.svelte.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";

	const term = $derived((page.url.searchParams.get("q") ?? "").trim());

	let input = $state((page.url.searchParams.get("q") ?? "").trim());
	$effect(() => {
		pageTitle.set(term ? `Search: ${term}` : "Search");
	});

	function runSearch(value: string, replace: boolean) {
		const query = value.trim();
		if (query === term) {
			return;
		}
		void goto(query ? `/search?q=${encodeURIComponent(query)}` : "/search", {
			keepFocus: true,
			noScroll: true,
			replaceState: replace,
		});
	}

	// Auto-search while typing (debounced); Enter still searches immediately.
	$effect(() => {
		const value = input;
		if (value.trim() === term) {
			return;
		}
		const timer = setTimeout(() => runSearch(value, true), 450);
		return () => clearTimeout(timer);
	});

	// Keep the box in sync with back / forward navigation.
	afterNavigate(() => {
		const q = (page.url.searchParams.get("q") ?? "").trim();
		if (q !== input.trim()) {
			input = q;
		}
	});

	const results = $derived(term ? searchCatalogs(term) : undefined);

	// Record a term once its results come back non-empty (local-only history).
	$effect(() => {
		if (term && (results?.current?.metas.length ?? 0) > 0) {
			untrack(() => searchHistory.record(term));
		}
	});

	const groups = $derived.by(() => {
		const metas = results?.current?.metas ?? [];
		const movies = metas.filter((meta) => meta.type === "movie");
		const series = metas.filter((meta) => meta.type === "series");
		const other = metas.filter(
			(meta) => meta.type !== "movie" && meta.type !== "series",
		);
		return { movies, series, other };
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		runSearch(input, false);
	}

	// Discover fallback — shown when there's no query, or when a query returned
	// nothing. Same catalog rows as the home feed.
	const browseQuery = homeRows();
	const browseRows = $derived((browseQuery.current ?? []).slice(0, 8));
</script>

{#snippet discoverRows()}
	{#if browseQuery.current === undefined}
		<MediaGrid items={[]} loading skeletonCount={12} />
	{:else}
		{#each browseRows as row (`${row.addonId}:${row.type}:${row.id}`)}
			<MediaRow
				title={row.title}
				items={row.metas}
				href={`/discover?c=${encodeURIComponent(`${row.addonId}|${row.type}|${row.id}`)}`}
			/>
		{/each}
	{/if}
{/snippet}

<div class="flex flex-col gap-8">
	<div class="flex flex-col gap-4">
		<h1 class="text-3xl font-bold tracking-tight">Search</h1>
		<form onsubmit={submit} class="relative">
			<SearchIcon
				class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:value={input}
				autofocus
				placeholder="Search movies and series"
				autocomplete="off"
				class="h-12 rounded-full pl-12 text-base"
			/>
		</form>
	</div>

	{#if !term}
		{#if searchHistory.entries.length > 0}
			<div class="flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<h2 class="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
						<ClockIcon class="size-3.5" /> Recent searches
					</h2>
					<button
						type="button"
						onclick={() => searchHistory.clear()}
						class="text-xs text-muted-foreground transition hover:text-foreground"
					>
						Clear
					</button>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each searchHistory.entries as entry (entry)}
						<span
							class="group/chip flex items-center gap-1 rounded-full bg-foreground/5 py-1 pr-1 pl-3 text-sm transition hover:bg-foreground/10"
						>
							<button
								type="button"
								onclick={() => runSearch(entry, false)}
								class="text-foreground/90 transition group-hover/chip:text-foreground"
							>
								{entry}
							</button>
							<button
								type="button"
								aria-label={`Remove ${entry}`}
								onclick={() => searchHistory.remove(entry)}
								class="flex size-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
							>
								<XIcon class="size-3" />
							</button>
						</span>
					{/each}
				</div>
			</div>
		{/if}
		{@render discoverRows()}
	{:else if results?.error}
		<p class="py-10 text-center text-sm text-destructive">Search failed. Try again.</p>
	{:else if !results?.current}
		<MediaGrid items={[]} loading />
	{:else if results.current.metas.length === 0}
		<div class="flex flex-col gap-8">
			<p class="text-sm text-muted-foreground">
				No results for "{term}". You might like:
			</p>
			{@render discoverRows()}
		</div>
	{:else}
		{#if groups.movies.length > 0}
			<section class="flex flex-col gap-3">
				<h2 class="text-xl font-semibold tracking-tight">Movies</h2>
				<MediaGrid items={groups.movies} />
			</section>
		{/if}
		{#if groups.series.length > 0}
			<section class="flex flex-col gap-3">
				<h2 class="text-xl font-semibold tracking-tight">Series</h2>
				<MediaGrid items={groups.series} />
			</section>
		{/if}
		{#if groups.other.length > 0}
			<section class="flex flex-col gap-3">
				<h2 class="text-xl font-semibold tracking-tight">Other</h2>
				<MediaGrid items={groups.other} />
			</section>
		{/if}
	{/if}
</div>
