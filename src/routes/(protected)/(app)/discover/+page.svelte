<script lang="ts">
	import CompassIcon from "@lucide/svelte/icons/compass";
	import { browseCatalog } from "#lib/addons/addons.remote.js";
	import type { MetaPreview } from "#lib/addons/index.js";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import QueryError from "#lib/components/feedback/query-error.svelte";
	import ScrollRail from "#lib/components/layout/scroll-rail.svelte";
	import MediaGrid from "#lib/components/media/grid.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { cn } from "#lib/utils.js";
	import { goto, invalidateAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { navigating, page } from "$app/state";

	pageTitle.set("Discover");

	let { data } = $props();

	// The catalog list streams in from the load (unawaited) so nav isn't blocked;
	// `selectedKey` / `genre` are read straight off the URL.
	const catalogsStream = streamed(
		() => data.catalogs,
		[] as Awaited<typeof data.catalogs>,
	);
	const catalogs = $derived(catalogsStream.current);
	const catalogsReady = $derived(catalogsStream.ready);
	const selectedKey = $derived(data.selectedKey ?? null);
	const genre = $derived(data.genre ?? "");

	// The `?c=` catalog if it matches, else the first available one.
	const selected = $derived(
		catalogs.find(
			(entry) => `${entry.addonId}|${entry.type}|${entry.id}` === selectedKey,
		) ?? catalogs[0],
	);

	const activeKey = $derived(
		selected ? `${selected.addonId}|${selected.type}|${selected.id}` : null,
	);

	// Pills are links, so the URL only changes once SvelteKit has round-tripped
	// the load. Highlight against the URL being navigated *to* so the click
	// lands visually straight away instead of looking ignored for the length of
	// a server fetch : that dead window is what made pill clicks feel dropped.
	const targetUrl = $derived(navigating.to?.url ?? page.url);
	const pendingKey = $derived(targetUrl.searchParams.get("c") ?? activeKey);
	const pendingGenre = $derived(targetUrl.searchParams.get("g") ?? "");

	/** `?c=` for a catalog; the genre never survives a catalog switch. */
	function catalogHref(key: string): string {
		const params = new URLSearchParams(page.url.search);
		params.set("c", key);
		params.delete("g");
		return `${resolve("discover")}?${params}`;
	}

	function genreHref(value: string): string {
		const params = new URLSearchParams(page.url.search);
		if (value) {
			params.set("g", value);
		} else {
			params.delete("g");
		}
		const query = params.toString();
		return query ? `${resolve("discover")}?${query}` : resolve("discover");
	}

	// A stale `?c=` (an addon was removed, or the link is just wrong) silently
	// falls back to the first catalog above : sync the URL to match so it
	// doesn't keep naming a catalog that isn't showing.
	//
	// Never while a navigation is in flight. The addon registry is rebuilt on a
	// TTL, so a rebuild that drops a slow addon can make `find` miss for one
	// render : firing then would replace the URL the viewer is currently
	// navigating to, landing them on a catalog they did not pick.
	$effect(() => {
		if (
			catalogsReady &&
			!navigating.to &&
			selectedKey &&
			activeKey &&
			selectedKey !== activeKey
		) {
			const params = new URLSearchParams(page.url.search);
			params.set("c", activeKey);
			// A newer navigation can still supersede this one : swallow that
			// rejection, or it surfaces as an uncaught "navigation aborted".
			void goto(`?${params}`, { reset: false, replace: true }).catch(() => {
				// A newer navigation won : this URL fixup no longer applies.
			});
		}
	});

	// Only disambiguate catalog pills by addon when more than one addon supplies them.
	const multipleAddons = $derived(
		new Set(catalogs.map((entry) => entry.addonId)).size > 1,
	);

	// Cinemeta reuses one catalog name ("Popular", "New"…) for both movie and
	// series, so pill labels collide. Suffix the repeats with their type.
	const catalogLabels = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const entry of catalogs) {
			counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
		}
		return new Map(
			catalogs.map((entry) => {
				const key = `${entry.addonId}|${entry.type}|${entry.id}`;
				if ((counts.get(entry.name) ?? 0) > 1) {
					const noun = entry.type === "series" ? "Series" : "Movies";
					return [key, `${entry.name} · ${noun}`];
				}
				return [key, entry.name];
			}),
		);
	});

	// The first page of catalog contents is fetched by the load from the URL's
	// own `?c=`/`?g=` and streamed down with the page, so it doesn't cost a
	// client round trip that can only start once the catalog list has landed
	// and the selection has been derived here. `null` once ready means the
	// catalog couldn't be read : the retry state below covers it.
	const firstPageStream = streamed(
		() => data.firstPage,
		null as Awaited<typeof data.firstPage>,
	);
	const firstPage = $derived(firstPageStream.current);
	const loadingFirst = $derived(!firstPageStream.ready);
	const firstPageFailed = $derived(firstPageStream.ready && firstPage === null);

	let more = $state<MetaPreview[]>([]);
	let loadingMore = $state(false);
	let exhausted = $state(false);

	// reset appended pages whenever the catalog / genre changes
	$effect(() => {
		void selectedKey;
		void genre;
		more = [];
		exhausted = false;
	});

	const items = $derived([...(firstPage?.metas ?? []), ...more]);

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
				genre: genre || undefined,
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
    <p class="text-sm text-muted-foreground">
      Browse every catalog your addons provide.
    </p>
  </div>

  {#if !catalogsReady && catalogs.length === 0}
    <div class="no-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2 py-1">
      {#each { length: 6 } as _skeleton, i (i)}
        <div class="skeleton h-8 w-24 shrink-0 rounded-full"></div>
      {/each}
    </div>
    <MediaGrid items={[]} loading skeletonCount={12} />
  {:else if catalogs.length === 0}
    <EmptyState
      icon={CompassIcon}
      title="No catalogs available"
      description="Add a catalog addon to start browsing movies and series."
    >
      {#snippet actions()}
        <Button href={resolve("addons")} variant="outline">Manage addons</Button
        >
      {/snippet}
    </EmptyState>
  {:else if selected}
    <ScrollRail label="Catalogs" arrows={false} trackClass="gap-2 py-1">
      {#each catalogs as entry (`${entry.addonId}|${entry.type}|${entry.id}`)}
        {@const key = `${entry.addonId}|${entry.type}|${entry.id}`}
        <a
          href={catalogHref(key)}
          aria-current={key === pendingKey ? "true" : undefined}
          class={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition",
            key === pendingKey
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
          )}
        >
          {catalogLabels.get(key) ?? entry.name}
          {#if multipleAddons}
            <span class="text-xs opacity-60">· {entry.addonName}</span>
          {/if}
        </a>
      {/each}
    </ScrollRail>

    {#if selected.genres.length > 0}
      <ScrollRail label="Genres" arrows={false} trackClass="gap-1.5 pb-1">
        <a
          href={genreHref("")}
          aria-current={pendingGenre ? undefined : "true"}
          class={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition",
            pendingGenre
              ? "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          All
        </a>
        {#each selected.genres as option (option)}
          <a
            href={genreHref(option)}
            aria-current={option === pendingGenre ? "true" : undefined}
            class={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition",
              option === pendingGenre
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            )}
          >
            {option}
          </a>
        {/each}
      </ScrollRail>
    {/if}

    {#if loadingFirst}
      <MediaGrid items={[]} loading skeletonCount={12} />
    {:else if firstPageFailed}
      <QueryError
        message="Couldn't load this catalog."
        onRetry={() => invalidateAll()}
      />
    {:else if items.length === 0}
      <EmptyState
        icon={CompassIcon}
        title="Nothing in this catalog"
        description={genre
          ? `No "${genre}" titles here.`
          : "This catalog came back empty."}
      >
        {#snippet actions()}
          {#if genre}
            <Button variant="outline" href={genreHref("")}>
              Clear genre filter
            </Button>
          {:else}
            <Button href={resolve("addons")} variant="outline"
              >Manage addons</Button
            >
          {/if}
        {/snippet}
      </EmptyState>
    {:else}
      <MediaGrid {items} loading={loadingMore} skeletonCount={6} />

      {#if !exhausted && (firstPage?.metas.length ?? 0) > 0}
        <div class="flex justify-center pt-2">
          <Button variant="outline" disabled={loadingMore} onclick={loadMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      {/if}
    {/if}
  {/if}
</div>
