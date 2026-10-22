<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FilmIcon from "@lucide/svelte/icons/film";
	import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
	import MonitorIcon from "@lucide/svelte/icons/monitor";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import Share2Icon from "@lucide/svelte/icons/share-2";
	import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";
	import UsersIcon from "@lucide/svelte/icons/users";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import XIcon from "@lucide/svelte/icons/x";
	import ZapIcon from "@lucide/svelte/icons/zap";
	import { cubicOut } from "svelte/easing";
	import { fade, fly } from "svelte/transition";
	import ChoiceList from "#lib/components/layout/choice-list.svelte";
	import FilterDrawer from "#lib/components/layout/filter-drawer.svelte";
	import { Separator } from "#lib/components/ui/separator/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { reduced } from "#lib/core/motion.js";
	import DownloadButton from "#lib/downloads/download-button.svelte";
	import { m } from "#lib/i18n/index.js";
	import {
		externalPlayerHandoff,
		prefersExternal,
	} from "#lib/player/external-player.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import { cn } from "#lib/utils.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { playbackHandoff } from "./playback.svelte.ts";
	import {
		isPlayable,
		type ResolvedStream,
		type StreamKind,
		streamKind,
		streamMeta,
	} from "./stream-format.ts";
	import StreamRow from "./stream-row.svelte";
	import { playbackMeta, resolveStreams } from "./watch.remote.ts";
	import { watchProviders } from "./watch-providers.remote.ts";
	import { EMPTY_PROVIDERS } from "./watch-providers.ts";
	import WatchProvidersList from "./watch-providers-list.svelte";

	let {
		type,
		videoId,
		onClose,
		sheet = false,
	}: {
		type: string;
		videoId: string;
		onClose: () => void;
		/** Inside a bottom sheet (phones), which owns the overlay and closing. */
		sheet?: boolean;
	} = $props();

	const contextQuery = $derived(playbackMeta({ type, id: videoId }));
	const heading = $derived(contextQuery.current?.heading ?? m.common_sources());
	const subheading = $derived(contextQuery.current?.subheading ?? null);

	// Official "where to watch" : shown prominently when no addon returns a
	// stream, and as a footer otherwise.
	const providersQuery = $derived.by(() => {
		const ctx = contextQuery.current;
		if (!ctx) {
			return;
		}
		return watchProviders({
			title: ctx.heading,
			year: Number((ctx.info?.releaseInfo ?? "").slice(0, 4)) || null,
			imdbId: /^tt\d+$/.test(ctx.contentId) ? ctx.contentId : null,
			region: theme.current.watchRegion,
		});
	});
	const providers = $derived(providersQuery?.current ?? EMPTY_PROVIDERS);
	const hasOfficial = $derived(
		providers.stream.length + providers.rent.length + providers.buy.length > 0,
	);

	const streamsQuery = $derived(resolveStreams({ type, id: videoId }));
	const result = $derived(streamsQuery.current);

	let refreshing = $state(false);
	let filtersOpen = $state(false);

	// Filters. Default: direct sources only, likely-silent hidden.
	let kinds = $state<Set<StreamKind>>(new Set(["direct"]));
	let quality = $state<string | null>(null);
	let addonFilter = $state<string | null>(null);
	let showSilent = $state(false);

	function resetFilters() {
		kinds = new Set(["direct"]);
		quality = null;
		addonFilter = null;
		showSilent = false;
	}

	// Reset whenever the target video changes.
	$effect(() => {
		void videoId;
		resetFilters();
		filtersOpen = false;
	});

	// Source as one choice, like the other filter sheets: direct, P2P, or both.
	const source = $derived(
		kinds.has("direct") && kinds.has("p2p")
			? "all"
			: kinds.has("p2p")
				? "p2p"
				: "direct",
	);
	function setSource(value: string) {
		kinds = new Set(
			value === "all"
				? ["direct", "p2p"]
				: [value === "p2p" ? "p2p" : "direct"],
		);
	}

	type Row = ResolvedStream & {
		info: ReturnType<typeof streamMeta>;
		kind: StreamKind;
	};

	const rows = $derived<Row[]>(
		(result?.streams ?? []).map((stream) => ({
			...stream,
			info: streamMeta(stream),
			kind: streamKind(stream),
		})),
	);

	const addons = $derived(
		[...new Set(rows.map((row) => row.addonName))].sort(),
	);
	const qualities = $derived(
		["4K", "1440p", "1080p", "720p", "480p", "360p"].filter((q) =>
			rows.some((row) => row.info.tags.includes(q)),
		),
	);
	const sourceOptions = $derived(
		[
			{ value: "direct", label: m.watch_filter_direct(), icon: ZapIcon },
			{ value: "p2p", label: "P2P", icon: Share2Icon },
			{ value: "all", label: m.watch_filter_all(), icon: LayoutGridIcon },
		].map((option) => {
			const count =
				option.value === "all"
					? rows.length
					: rows.filter((row) => row.kind === option.value).length;
			return { ...option, label: `${option.label} (${count})` };
		}),
	);
	const silentCount = $derived(
		rows.filter((row) => row.info.audio === "risky").length,
	);

	// Filter, then sink likely-silent sources (unsupported audio codec) to the
	// bottom : stable, so addon order is otherwise preserved.
	const shown = $derived(
		rows
			.filter(
				(row) =>
					(kinds.size === 0 || kinds.has(row.kind)) &&
					(!quality || row.info.tags.includes(quality)) &&
					(!addonFilter || row.addonName === addonFilter) &&
					(showSilent || row.info.audio !== "risky"),
			)
			.map((row, order) => ({ row, order }))
			.sort(
				(a, b) =>
					Number(a.row.info.audio === "risky") -
						Number(b.row.info.audio === "risky") || a.order - b.order,
			)
			.map((entry) => entry.row),
	);

	const activeFilters = $derived(
		Number(!(kinds.size === 1 && kinds.has("direct"))) +
			Number(quality !== null) +
			Number(addonFilter !== null) +
			Number(showSilent),
	);

	async function refresh() {
		refreshing = true;
		try {
			await streamsQuery.refresh();
		} finally {
			refreshing = false;
		}
	}

	/**
	 * Worth clicking when it plays here, or when the app can hand it to an
	 * external player : a deep link, a `magnet:` for a P2P source, or a URL to
	 * copy. `externalPlayerHandoff` is what the player's own handoff screen
	 * asks, so asking it here keeps the two from disagreeing : the drawer used
	 * to check `externalUrl` alone and so greyed out every P2P row, which is
	 * exactly what "Show all sources" reveals.
	 */
	function actionable(row: Row): boolean {
		return (
			isPlayable(row) ||
			externalPlayerHandoff(row, navigator.userAgent) !== null
		);
	}

	function pick(row: Row) {
		if (!isPlayable(row) && row.externalUrl) {
			window.open(row.externalUrl, "_blank", "noopener");
			return;
		}
		if (prefersExternal(theme.current.externalPlayer, navigator.userAgent)) {
			const handoff = externalPlayerHandoff(
				row,
				navigator.userAgent,
				theme.current.externalPlayer,
			);
			if (handoff?.kind === "link") {
				window.location.href = handoff.href;
				return;
			}
		}
		playbackHandoff.select(videoId, row, row.info.title);
		// Not playable here still goes to the player: it owns the "can't play in
		// the browser" screen, with the external-player link and the copy
		// fallback. The (watch) layout closes the drawer on `afterNavigate`.
		void goto(resolve(`player/${type}/${encodeURIComponent(videoId)}`));
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== "Escape") {
			return;
		}
		if (filtersOpen) {
			filtersOpen = false;
		} else if (!sheet) {
			onClose();
		}
	}

	// Modal behaviour: move focus in on mount, trap Tab, restore on close.
	function modal(node: HTMLElement) {
		const previous = document.activeElement as HTMLElement | null;
		const focusables = () =>
			[
				...node.querySelectorAll<HTMLElement>(
					'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
				),
			].filter((el) => el.offsetParent !== null);
		focusables()[0]?.focus();

		function onTab(event: KeyboardEvent) {
			if (event.key !== "Tab") {
				return;
			}
			const items = focusables();
			if (items.length === 0) {
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
		node.addEventListener("keydown", onTab);
		return {
			destroy() {
				node.removeEventListener("keydown", onTab);
				previous?.focus?.();
			},
		};
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if !sheet}
  <button
    type="button"
    aria-label={m.watch_close_sources()}
    onclick={onClose}
    transition:fade={reduced({ duration: 150 })}
    class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
  ></button>
{/if}

<!-- The app's filter drawer: stacked on the sources sheet on a phone, from
     the right on a desktop. The toolbar's own button opens it. -->
<FilterDrawer bind:open={filtersOpen} nested={sheet} trigger="none">
    <ChoiceList
      title={m.watch_filter_source()}
      options={sourceOptions}
      value={source}
      onSelect={setSource}
    />
    <p class="-mt-1 px-1 text-[11px] text-muted-foreground">
      {m.watch_filter_p2p_hint()}
    </p>

    {#if qualities.length > 0}
      <ChoiceList
        title={m.watch_filter_quality()}
        options={[
          { value: "", label: m.watch_filter_any(), icon: LayoutGridIcon },
          ...qualities.map((q) => ({ value: q, label: q, icon: MonitorIcon })),
        ]}
        value={quality ?? ""}
        onSelect={(value) => (quality = value || null)}
      />
    {/if}

    {#if addons.length > 1}
      <ChoiceList
        title={m.watch_filter_addon()}
        options={[
          { value: "", label: m.watch_filter_all(), icon: LayoutGridIcon },
          ...addons.map((addon) => ({
            value: addon,
            label: addon,
            icon: PuzzleIcon,
          })),
        ]}
        value={addonFilter ?? ""}
        onSelect={(value) => (addonFilter = value || null)}
      />
    {/if}

    {#if silentCount > 0}
      <label class="glass flex items-center gap-3 rounded-3xl px-4 py-3">
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
        >
          <VolumeXIcon class="size-4" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-sm font-medium">
            {m.watch_filter_show_silent({ count: silentCount })}
          </span>
          <span class="text-[11px] text-muted-foreground">
            {m.watch_filter_silent_hint()}
          </span>
        </span>
        <Switch
          checked={showSilent}
          onCheckedChange={(value) => (showSilent = value)}
        />
      </label>
    {/if}

</FilterDrawer>

{#snippet panel()}
  <!-- App-style: the title leads, the controls are pills under it. -->
  <header
    class={cn(
      "flex items-start gap-3",
      sheet ? "justify-center px-4 pt-1 text-center" : "px-4 pt-4",
    )}
  >
    <div class="min-w-0 flex-1">
      <p class="truncate text-lg font-bold tracking-tight">{heading}</p>
      {#if subheading}
        <p class="truncate text-sm text-muted-foreground">{subheading}</p>
      {/if}
    </div>
    {#if !sheet}
      <button
        type="button"
        aria-label={m.common_close()}
        onclick={onClose}
        class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
      >
        <XIcon class="size-4" />
      </button>
    {/if}
  </header>

  <div class="flex items-center gap-2 px-4 py-3">
    <span
      class="rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-accent-label"
    >
      {result
        ? m.watch_sources_count({ shown: shown.length, total: rows.length })
        : m.common_loading()}
    </span>
    <span class="flex-1"></span>
    <button
      type="button"
      disabled={!result || rows.length === 0}
      onclick={() => (filtersOpen = !filtersOpen)}
      class={cn(
        "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition disabled:opacity-50",
        activeFilters > 0
          ? "bg-primary/15 text-accent-label"
          : "bg-foreground/5 hover:bg-foreground/10",
      )}
    >
      <SlidersHorizontalIcon class="size-4" />
      {m.watch_filters()}
      {#if activeFilters > 0}
        <span
          class="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {activeFilters}
        </span>
      {/if}
    </button>
    <button
      type="button"
      aria-label={m.watch_refresh()}
      title={m.watch_refresh()}
      disabled={refreshing || !result}
      onclick={refresh}
      class="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/5 transition hover:bg-foreground/10 disabled:opacity-50"
    >
      <RefreshCwIcon class={cn("size-4", refreshing && "animate-spin")} />
    </button>
  </div>

  <div
    class={cn(
      "min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin",
    )}
  >
    {#if streamsQuery.error}
      <div class="flex flex-col items-center gap-3 py-12 text-center">
        <p class="text-sm font-medium">{m.watch_addons_unreachable()}</p>
        <button
          type="button"
          onclick={refresh}
          class="rounded-md bg-foreground/5 px-3 py-1.5 text-sm font-medium hover:bg-foreground/10"
        >
          {m.common_try_again()}
        </button>
      </div>
    {:else if !result}
      <div class="flex flex-col gap-2">
        {#each { length: 6 } as _skeleton, i (i)}
          <div class="skeleton h-20 rounded-lg"></div>
        {/each}
      </div>
    {:else if rows.length === 0}
      <div class="flex flex-col gap-5">
        {#if hasOfficial}
          <WatchProvidersList {providers} heading={m.watch_officially()} />
        {/if}
        <div class="flex flex-col items-center gap-2 py-8 text-center">
          <p class="text-sm font-medium">{m.watch_no_addon_streams()}</p>
          <p class="max-w-60 text-xs text-muted-foreground">
            {m.watch_no_addon_streams_body()}
            {#if result.errors.length > 0}
              {m.watch_addons_errored({ count: result.errors.length })}
            {/if}
          </p>
          <button
            type="button"
            onclick={refresh}
            class="mt-1 rounded-md bg-foreground/5 px-3 py-1.5 text-sm font-medium hover:bg-foreground/10"
          >
            {m.watch_check_again()}
          </button>
        </div>
      </div>
    {:else if shown.length === 0}
      <div class="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <p class="text-sm font-medium">
          {m.watch_sources_hidden({ count: rows.length })}
        </p>
        <p class="max-w-64 text-xs text-muted-foreground">
          {m.watch_sources_hidden_body()}
        </p>
        <button
          type="button"
          onclick={() => {
            resetFilters();
            kinds = new Set(["direct", "p2p"]);
            showSilent = true;
          }}
          class="mt-1 rounded-md bg-foreground/5 px-3 py-1.5 text-xs font-medium hover:bg-foreground/10"
        >
          {m.watch_show_all_sources()}
        </button>
      </div>
    {:else}
      <div class="flex flex-col gap-1.5">
        {#each shown as row (row.index)}
          <div class="flex items-stretch gap-1.5">
            <StreamRow
              {row}
              disabled={!actionable(row)}
              onclick={() => pick(row)}
            />
            {#if isPlayable(row) && contextQuery.current}
              <DownloadButton
                context={contextQuery.current}
                url={row.url ?? ""}
                label={row.info.title}
                addonName={row.addonName}
              />
            {/if}
          </div>
        {/each}
      </div>

      {#if result.errors.length > 0}
        <p class="mt-3 text-[11px] text-muted-foreground">
          {m.watch_addons_no_response({
            names: result.errors.map((entry) => entry.addonName).join(", "),
          })}
        </p>
      {/if}

      {#if hasOfficial}
        <div class="mt-5 pt-4">
          <Separator class="mb-4 bg-border/60" />
          <WatchProvidersList {providers} />
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

{#if sheet}
  <div class="flex min-h-0 flex-1 flex-col">
    {@render panel()}
  </div>
{:else}
  <div
    use:modal
    role="dialog"
    aria-modal="true"
    aria-label={m.common_sources()}
    transition:fly={reduced({ x: 480, duration: 260, easing: cubicOut })}
    class="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 flex w-[calc(100%-1.5rem)] max-w-105 flex-col overflow-hidden rounded-3xl bg-linear-to-b from-background/65 to-background/85 shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_24px_60px_-12px_rgb(0_0_0/0.6)] ring-1 ring-foreground/10 backdrop-blur-2xl backdrop-saturate-150"
  >
    {@render panel()}
  </div>
{/if}
