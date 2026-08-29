<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { searchCatalogs } from "$lib/addons/addons.remote";
	import MediaGrid from "$lib/components/media-grid.svelte";
	import { Input } from "$lib/components/ui/input/index.js";

	const term = $derived((page.url.searchParams.get("q") ?? "").trim());

	let input = $state("");
	$effect(() => {
		input = term;
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
		const next = input.trim();
		goto(next ? `/search?q=${encodeURIComponent(next)}` : "/search", {
			keepFocus: true,
		});
	}
</script>

<div class="flex flex-col gap-8">
	<div class="flex flex-col gap-4">
		<h1 class="text-3xl font-bold tracking-tight">Search</h1>
		<form onsubmit={submit} class="relative max-w-2xl">
			<SearchIcon
				class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:value={input}
				placeholder="Search movies and series"
				autocomplete="off"
				class="h-12 rounded-full pl-12 text-base"
			/>
		</form>
	</div>

	{#if !term}
		<div class="flex flex-col items-center gap-3 py-20 text-center">
			<span
				class="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border"
			>
				<SearchIcon class="size-7" />
			</span>
			<p class="text-lg font-semibold tracking-tight">Find something to watch</p>
			<p class="max-w-sm text-sm text-muted-foreground">
				Type a title and press Enter to search across every catalog your addons support.
			</p>
		</div>
	{:else if results?.error}
		<p class="py-10 text-center text-sm text-destructive">Search failed. Try again.</p>
	{:else if !results?.current}
		<MediaGrid items={[]} loading />
	{:else if results.current.metas.length === 0}
		<p class="py-10 text-center text-sm text-muted-foreground">No results for "{term}".</p>
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
