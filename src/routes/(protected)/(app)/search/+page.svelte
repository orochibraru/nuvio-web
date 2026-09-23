<script lang="ts">
	import ClockIcon from "@lucide/svelte/icons/clock";
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";
	import { untrack } from "svelte";
	import QueryError from "#lib/components/feedback/query-error.svelte";
	import MediaGrid from "#lib/components/media/grid.svelte";
	import MediaRow from "#lib/components/media/row.svelte";
	import { Input } from "#lib/components/ui/input/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { searchHistory } from "#lib/search/search-history.svelte.js";
	import { browser } from "$app/env";
	import {
		afterNavigate,
		beforeNavigate,
		goto,
		invalidateAll,
	} from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	let { data } = $props();

	// A native `autofocus` pops the on-screen keyboard the instant a touch
	// device paints this page, before the viewer has asked to type : only
	// steal focus where a keyboard doesn't cost anything.
	let searchInput = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (browser && !window.matchMedia("(pointer: coarse)").matches) {
			searchInput?.focus();
		}
	});

	const term = $derived((page.url.searchParams.get("q") ?? "").trim());

	let input = $state((page.url.searchParams.get("q") ?? "").trim());
	$effect(() => {
		pageTitle.set(term ? m.search_title_term({ term }) : m.nav_search());
	});

	function runSearch(value: string, replace: boolean) {
		const query = value.trim();
		if (query === term) {
			return;
		}
		void goto(
			query
				? resolve(`search?q=${encodeURIComponent(query)}`)
				: resolve("search"),
			{ reset: false, replace },
		);
	}

	// Auto-search while typing (debounced); Enter still searches immediately.
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const value = input;
		if (value.trim() === term) {
			return;
		}
		debounceTimer = setTimeout(() => runSearch(value, true), 450);
		return () => clearTimeout(debounceTimer);
	});

	// A navigation away (e.g. clicking another nav link) must win outright : the
	// effect cleanup above only clears the timer once this component actually
	// unmounts, which happens after the destination finishes loading. On a slow
	// navigation the debounce can still fire in that window and its `goto` to
	// `/search?q=…` overrides the one already in flight. Cancel eagerly instead.
	beforeNavigate(() => {
		clearTimeout(debounceTimer);
	});

	// Keep the box in sync with back / forward navigation.
	afterNavigate(({ shallow }) => {
		if (shallow) {
			return;
		}

		const q = (page.url.searchParams.get("q") ?? "").trim();
		if (q !== input.trim()) {
			input = q;
		}
	});

	// Results are resolved by the load from `?q=` and streamed down with the
	// page, so they don't wait on hydration plus a round trip. `null` once
	// ready means the addons couldn't be reached (as opposed to no matches).
	const resultsStream = streamed(
		() => data.results ?? undefined,
		null as Awaited<typeof data.results>,
	);
	const results = $derived(resultsStream.current);
	const resultsLoading = $derived(Boolean(term) && !resultsStream.ready);
	const resultsFailed = $derived(
		Boolean(term) && resultsStream.ready && results === null,
	);

	// Record a term once its results come back non-empty (local-only history).
	$effect(() => {
		if (term && (results?.metas.length ?? 0) > 0) {
			untrack(() => searchHistory.record(term));
		}
	});

	const groups = $derived.by(() => {
		const metas = results?.metas ?? [];
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

	// Discover fallback : shown when there's no query, or when a query returned
	// nothing. Same catalog rows as the home feed, fetched by this page's load.
	const browseStream = streamed(
		() => data.browseRows,
		[] as Awaited<typeof data.browseRows>,
	);
	const browseRows = $derived(browseStream.current.slice(0, 8));
	const browseLoading = $derived(!browseStream.ready);
</script>

{#snippet discoverRows()}
  {#if browseLoading}
    <MediaGrid items={[]} loading skeletonCount={12} />
  {:else}
    {#each browseRows as row (`${row.addonId}:${row.type}:${row.id}`)}
      <MediaRow
        title={row.title}
        items={row.metas}
        href={resolve(
          `discover?c=${encodeURIComponent(`${row.addonId}|${row.type}|${row.id}`)}`,
        )}
      />
    {/each}
  {/if}
{/snippet}

<div class="flex flex-col gap-8">
  <div class="flex flex-col gap-4">
    <h1 class="text-3xl font-bold tracking-tight">{m.nav_search()}</h1>
    <form onsubmit={submit} class="relative">
      <SearchIcon
        class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        bind:ref={searchInput}
        bind:value={input}
        placeholder={m.search_placeholder()}
        autocomplete="off"
        class="h-12 rounded-full pl-12 text-base"
      />
    </form>
  </div>

  {#if !term}
    {#if searchHistory.entries.length > 0}
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h2
            class="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
          >
            <ClockIcon class="size-3.5" /> {m.search_recent()}
          </h2>
          <button
            type="button"
            onclick={() => searchHistory.clear()}
            class="text-xs text-muted-foreground transition hover:text-foreground"
          >
            {m.search_clear()}
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
                aria-label={m.search_remove_entry({ entry })}
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
  {:else if resultsFailed}
    <QueryError
      message={m.search_failed()}
      onRetry={() => invalidateAll()}
      class="mt-6"
    />
  {:else if resultsLoading || !results}
    <MediaGrid items={[]} loading />
  {:else if results.metas.length === 0}
    <div class="flex flex-col gap-8">
      <p class="text-sm text-muted-foreground">
        {m.search_no_results({ term })}
      </p>
      {@render discoverRows()}
    </div>
  {:else}
    {#if groups.movies.length > 0}
      <section class="flex flex-col gap-3">
        <h2 class="text-xl font-semibold tracking-tight">{m.common_movies()}</h2>
        <MediaGrid items={groups.movies} />
      </section>
    {/if}
    {#if groups.series.length > 0}
      <section class="flex flex-col gap-3">
        <h2 class="text-xl font-semibold tracking-tight">{m.common_series()}</h2>
        <MediaGrid items={groups.series} />
      </section>
    {/if}
    {#if groups.other.length > 0}
      <section class="flex flex-col gap-3">
        <h2 class="text-xl font-semibold tracking-tight">{m.search_other()}</h2>
        <MediaGrid items={groups.other} />
      </section>
    {/if}
  {/if}
</div>
