<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";
	import { afterNavigate, goto } from "$app/navigation";
	import { page } from "$app/state";
	import { homeRows, searchCatalogs } from "$lib/addons/addons.remote";
	import MediaGrid from "$lib/components/media-grid.svelte";
	import MediaRow from "$lib/components/media-row.svelte";
	import { Input } from "$lib/components/ui/input/index.js";
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
