<script lang="ts">
	import ArchiveIcon from "@lucide/svelte/icons/archive";
	import CalendarIcon from "@lucide/svelte/icons/calendar";
	import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import FilmIcon from "@lucide/svelte/icons/film";
	import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
	import SearchIcon from "@lucide/svelte/icons/search";
	import ShapesIcon from "@lucide/svelte/icons/shapes";
	import StarIcon from "@lucide/svelte/icons/star";
	import TvIcon from "@lucide/svelte/icons/tv";
	import XIcon from "@lucide/svelte/icons/x";
	import { untrack } from "svelte";
	import QueryError from "#lib/components/feedback/query-error.svelte";
	import ChoiceList from "#lib/components/layout/choice-list.svelte";
	import FilterDrawer from "#lib/components/layout/filter-drawer.svelte";
	import MediaGrid from "#lib/components/media/grid.svelte";
	import MediaRow from "#lib/components/media/row.svelte";
	import { Input } from "#lib/components/ui/input/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import {
		activeSearchFilters,
		genresOf,
		matchesSearchFilters,
		SEARCH_RATINGS,
		SEARCH_RELEASES,
		SEARCH_TYPES,
		searchFiltersFrom,
	} from "#lib/search/filters.js";
	import { SEARCH_FOCUS_EVENT } from "#lib/search/focus.js";
	import { genreIcon } from "#lib/search/genre-icons.js";
	import { searchHistory } from "#lib/search/search-history.svelte.js";
	import { cn } from "#lib/utils.js";
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

	// A second tap on the phone's Search tab asks for the keyboard.
	$effect(() => {
		const focus = () => searchInput?.focus();
		window.addEventListener(SEARCH_FOCUS_EVENT, focus);
		return () => window.removeEventListener(SEARCH_FOCUS_EVENT, focus);
	});

	const term = $derived((page.url.searchParams.get("q") ?? "").trim());

	let input = $state((page.url.searchParams.get("q") ?? "").trim());
	$effect(() => {
		pageTitle.set(term ? m.search_title_term({ term }) : m.nav_search());
	});

	// A new query keeps whatever filters are on.
	function runSearch(value: string, replace: boolean) {
		const query = value.trim();
		if (query === term) {
			return;
		}
		const params = new URLSearchParams(page.url.search);
		if (query) {
			params.set("q", query);
		} else {
			params.delete("q");
		}
		const search = params.toString();
		void goto(search ? resolve(`search?${search}`) : resolve("search"), {
			reset: false,
			replace,
		});
	}

	const filters = $derived(searchFiltersFrom(page.url.searchParams));
	const activeFilters = $derived(activeSearchFilters(filters));
	let filtersOpen = $state(false);

	function setFilter(key: string, value: string, fallback: string) {
		const params = new URLSearchParams(page.url.search);
		if (value === fallback) {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		const search = params.toString();
		void goto(search ? resolve(`search?${search}`) : resolve("search"), {
			reset: false,
			replace: true,
		});
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
		const metas = (results?.metas ?? []).filter((meta) =>
			matchesSearchFilters(meta, filters),
		);
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
	const browseRows = $derived(
		browseStream.current
			.slice(0, 8)
			.filter((row) => filters.type === "all" || row.type === filters.type)
			.map((row) => ({
				...row,
				metas: row.metas.filter((meta) => matchesSearchFilters(meta, filters)),
			}))
			.filter((row) => row.metas.length > 0),
	);
	// The Genre choices come from what's on the page, unfiltered.
	const genres = $derived(
		genresOf([
			...(results?.metas ?? []),
			...browseStream.current.slice(0, 8).flatMap((row) => row.metas),
		]),
	);
	const filterGroups = $derived([
		{
			key: "type",
			title: m.search_filter_type(),
			value: filters.type as string,
			fallback: "all",
			options: SEARCH_TYPES.map((value) => ({
				value,
				icon:
					value === "movie"
						? FilmIcon
						: value === "series"
							? TvIcon
							: LayoutGridIcon,
				label:
					value === "movie"
						? m.common_movies()
						: value === "series"
							? m.common_series()
							: m.library_filter_all(),
			})),
		},
		{
			key: "genre",
			title: m.search_filter_genre(),
			value: filters.genre,
			fallback: "",
			options: [
				{ value: "", label: m.search_filter_any(), icon: ShapesIcon },
				...genres.map((genre) => ({
					value: genre,
					label: genre,
					icon: genreIcon(genre),
				})),
			],
		},
		{
			key: "released",
			title: m.search_filter_released(),
			value: filters.released as string,
			fallback: "any",
			options: SEARCH_RELEASES.map((value) => ({
				value,
				icon:
					value === "any"
						? CalendarDaysIcon
						: value === "recent"
							? CalendarClockIcon
							: value === "older"
								? ArchiveIcon
								: CalendarIcon,
				label:
					value === "recent"
						? m.search_released_recent()
						: value === "older"
							? m.search_released_older()
							: value === "any"
								? m.search_filter_any()
								: m.search_released_decade({ decade: value.slice(0, 4) }),
			})),
		},
		{
			key: "rating",
			title: m.search_filter_rating(),
			value: filters.rating as string,
			fallback: "any",
			options: SEARCH_RATINGS.map((value) => ({
				value,
				icon: StarIcon,
				label: value === "any" ? m.search_filter_any() : `${value}+`,
			})),
		},
	]);
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
    <div class="flex items-center gap-2">
      <form onsubmit={submit} class="relative flex-1">
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
      <FilterDrawer bind:open={filtersOpen} active={activeFilters} trigger="icon">
        {#each filterGroups as group (group.key)}
          {#if group.options.length > 1}
            <ChoiceList
              title={group.title}
              options={group.options}
              value={group.value}
              onSelect={(value) => setFilter(group.key, value, group.fallback)}
            />
          {/if}
        {/each}
      </FilterDrawer>
    </div>
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
