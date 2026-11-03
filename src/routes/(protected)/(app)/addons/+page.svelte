<script lang="ts">
	import CaptionsIcon from "@lucide/svelte/icons/captions";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import FilmIcon from "@lucide/svelte/icons/film";
	import FolderIcon from "@lucide/svelte/icons/folder";
	import InfoIcon from "@lucide/svelte/icons/info";
	import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import RadioIcon from "@lucide/svelte/icons/radio";
	import ScaleIcon from "@lucide/svelte/icons/scale";
	import SearchIcon from "@lucide/svelte/icons/search";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import TvIcon from "@lucide/svelte/icons/tv";
	import AddonLogo from "#lib/addons/components/addon-logo.svelte";
	import {
		ALL,
		DIRECTORY_RESOURCES,
		DIRECTORY_TYPES,
		type DirectoryAddon,
		type DirectorySource,
		filterDirectory,
	} from "#lib/addons/directory.js";
	import { resourceLabel, typeLabel } from "#lib/addons/labels.js";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import QueryError from "#lib/components/feedback/query-error.svelte";
	import ChoiceList from "#lib/components/layout/choice-list.svelte";
	import FilterDrawer from "#lib/components/layout/filter-drawer.svelte";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { goto, refreshAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	pageTitle.set(m.settings_addons_browse_title());

	let { data } = $props();

	const directoryStream = streamed(
		() => data.directory,
		null as { sources: DirectorySource[]; addons: DirectoryAddon[] } | null,
	);
	const directory = $derived(directoryStream.current);

	const resourceIcons = {
		catalog: LayoutGridIcon,
		meta: InfoIcon,
		stream: PlayIcon,
		subtitles: CaptionsIcon,
	};
	const typeIcons = {
		movie: FilmIcon,
		series: TvIcon,
		anime: SparklesIcon,
		tv: TvIcon,
		channel: RadioIcon,
	};

	const sourceOptions = $derived([
		{ value: ALL, label: m.addons_filter_all_sources(), icon: FolderIcon },
		...(directory?.sources ?? []).map((source) => ({
			value: source.key,
			label: source.name,
			icon: FolderIcon,
		})),
	]);
	const resourceOptions = [
		{ value: ALL, label: m.addons_filter_any_resource(), icon: PuzzleIcon },
		...DIRECTORY_RESOURCES.map((resource) => ({
			value: resource,
			label: resourceLabel(resource),
			icon: resourceIcons[resource],
		})),
	];
	const typeOptions = [
		{ value: ALL, label: m.addons_filter_any_type(), icon: LayoutGridIcon },
		...DIRECTORY_TYPES.map((type) => ({
			value: type,
			label: typeLabel(type),
			icon: typeIcons[type],
		})),
	];

	function param(key: string, options: ReadonlyArray<{ value: string }>) {
		const value = page.url.searchParams.get(key);
		return options.some((option) => option.value === value)
			? (value as string)
			: ALL;
	}
	const source = $derived(param("source", sourceOptions));
	const resource = $derived(param("resource", resourceOptions));
	const type = $derived(param("type", typeOptions));
	let search = $state("");

	function setParam(key: string, value: string) {
		const params = new URLSearchParams(page.url.search);
		if (value === ALL) {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		if (key !== "page") {
			params.delete("page");
		}
		const query = params.toString();
		void goto(query ? `?${query}` : "?", { replace: true, reset: false });
	}

	let filtersOpen = $state(false);
	const activeFilters = $derived(
		Number(source !== ALL) + Number(resource !== ALL) + Number(type !== ALL),
	);

	const shown = $derived(
		filterDirectory(directory?.addons ?? [], {
			source,
			resource,
			type,
			search,
		}),
	);
	const PAGE_SIZE = 24;
	const pageCount = $derived(Math.max(1, Math.ceil(shown.length / PAGE_SIZE)));
	const currentPage = $derived(
		Math.min(
			pageCount,
			Math.max(1, Math.trunc(Number(page.url.searchParams.get("page"))) || 1),
		),
	);
	const visible = $derived(
		shown.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
	);
	function goToPage(target: number) {
		setParam("page", target === 1 ? ALL : String(target));
	}

	const sourceNames = $derived(
		new Map(
			(directory?.sources ?? []).map((entry) => [
				entry.key,
				entry.name === entry.addonName
					? entry.name
					: `${entry.name} (${entry.addonName})`,
			]),
		),
	);
	function listedBy(keys: string[]): string {
		return keys.map((key) => sourceNames.get(key) ?? key).join(", ");
	}

	const failedSources = $derived(
		(directory?.sources ?? []).filter((entry) => entry.failed),
	);
</script>

<div class="flex flex-col gap-6">
  <a
    href={resolve("settings/addons")}
    class="-ml-2 flex w-fit items-center gap-0.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-primary transition active:scale-95 md:hidden"
  >
    <ChevronLeftIcon class="size-5" />
    {m.settings_section_addons()}
  </a>

  <div class="flex flex-col gap-1.5">
    <h1 class="text-3xl font-bold tracking-tight">{m.settings_addons_browse_title()}</h1>
    <p class="text-sm text-muted-foreground">
      {#if directory}
        {m.addons_count({ count: shown.length })}
      {:else}
        {m.addons_browse_description()}
      {/if}
    </p>
  </div>

  <div class="flex items-center gap-2">
    <label
      class="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-foreground/5 px-4 transition focus-within:bg-foreground/10"
    >
      <SearchIcon class="size-4 shrink-0 text-muted-foreground" />
      <input
        bind:value={search}
        oninput={() => currentPage > 1 && goToPage(1)}
        type="search"
        aria-label={m.addons_search_placeholder()}
        placeholder={m.addons_search_placeholder()}
        class="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
      />
    </label>
    <FilterDrawer bind:open={filtersOpen} active={activeFilters}>
      {#if sourceOptions.length > 2}
        <ChoiceList
          title={m.addons_filter_source()}
          options={sourceOptions}
          value={source}
          onSelect={(value) => setParam("source", value)}
        />
      {/if}
      <ChoiceList
        title={m.addons_filter_resource()}
        options={resourceOptions}
        value={resource}
        onSelect={(value) => setParam("resource", value)}
      />
      <ChoiceList
        title={m.addons_filter_type()}
        options={typeOptions}
        value={type}
        onSelect={(value) => setParam("type", value)}
      />
    </FilterDrawer>
  </div>

  <Alert.Root>
    <ScaleIcon />
    <Alert.Title>{m.addons_legal_title()}</Alert.Title>
    <Alert.Description>
      {#if directory && directory.sources.length > 0}
        <p>{m.addons_legal_sources({ sources: listedBy(directory.sources.map((entry) => entry.key)) })}</p>
      {/if}
      <p class="font-medium text-foreground">{m.addons_legal_rule()}</p>
    </Alert.Description>
  </Alert.Root>

  {#if failedSources.length > 0}
    <Alert.Root variant="destructive">
      <TriangleAlertIcon />
      <Alert.Description>
        {m.addons_sources_failed({
          names: failedSources.map((entry) => entry.name).join(", "),
        })}
      </Alert.Description>
    </Alert.Root>
  {/if}

  {#if !directoryStream.ready}
    <div
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1800px]:grid-cols-5 min-[2400px]:grid-cols-6"
    >
      {#each { length: 12 } as _skeleton, index (index)}
        <div class="skeleton h-36 rounded-3xl"></div>
      {/each}
    </div>
  {:else if !directory}
    <QueryError message={m.addons_load_failed()} onRetry={() => refreshAll()} />
  {:else if directory.addons.length === 0}
    <EmptyState
      icon={PuzzleIcon}
      title={m.addons_empty_title()}
      description={m.addons_empty_description()}
    />
  {:else if shown.length === 0}
    <p class="py-16 text-center text-sm text-muted-foreground">
      {m.addons_no_match()}
    </p>
  {:else}
    <ul
      class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1800px]:grid-cols-5 min-[2400px]:grid-cols-6"
    >
      {#each visible as addon (addon.detailsId)}
        <li class="content-auto">
          <a
            href={resolve(`addons/${addon.detailsId}`)}
            class="glass flex h-full gap-4 rounded-3xl p-4 transition-colors hover:bg-foreground/5 active:bg-foreground/5"
          >
            <AddonLogo src={addon.logo} class="size-12 rounded-2xl" />
            <span class="flex min-w-0 flex-1 flex-col gap-1.5">
              <span class="flex items-center gap-2">
                <span class="truncate font-semibold">{addon.name}</span>
                {#if addon.version}
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {m.addons_version({ version: addon.version })}
                  </span>
                {/if}
                {#if addon.installed}
                  <Badge class="ml-auto">
                    <CheckIcon data-icon="inline-start" />
                    {m.addons_installed()}
                  </Badge>
                {/if}
              </span>
              {#if addon.description}
                <span class="line-clamp-2 text-sm text-muted-foreground">
                  {addon.description}
                </span>
              {/if}
              {#if addon.sources.length > 0}
                <span class="truncate text-xs text-muted-foreground">
                  {m.addons_listed_by({ sources: listedBy(addon.sources) })}
                </span>
              {/if}
              <span class="mt-auto flex flex-wrap gap-1 pt-1">
                {#each addon.types as entry (entry)}
                  <Badge variant="outline" class="text-[10px]">
                    {typeLabel(entry)}
                  </Badge>
                {/each}
                {#each addon.resources as entry (entry)}
                  <Badge variant="secondary" class="text-[10px]">
                    {resourceLabel(entry)}
                  </Badge>
                {/each}
              </span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
    {#if pageCount > 1}
      <nav class="flex items-center justify-center gap-3" aria-label={m.addons_page({ page: currentPage, count: pageCount })}>
        <Button
          variant="outline"
          size="icon"
          class="rounded-full"
          disabled={currentPage === 1}
          aria-label={m.addons_page_previous()}
          onclick={() => goToPage(currentPage - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <span class="text-sm text-muted-foreground tabular-nums">
          {m.addons_page({ page: currentPage, count: pageCount })}
        </span>
        <Button
          variant="outline"
          size="icon"
          class="rounded-full"
          disabled={currentPage === pageCount}
          aria-label={m.addons_page_next()}
          onclick={() => goToPage(currentPage + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </nav>
    {/if}
  {/if}
</div>
