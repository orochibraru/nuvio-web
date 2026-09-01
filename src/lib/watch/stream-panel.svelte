<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import FilmIcon from "@lucide/svelte/icons/film";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";
	import UsersIcon from "@lucide/svelte/icons/users";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import XIcon from "@lucide/svelte/icons/x";
	import { cubicOut } from "svelte/easing";
	import { fade, fly } from "svelte/transition";
	import { theme } from "#lib/settings/theme.svelte.js";
	import { cn } from "#lib/utils.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { playbackHandoff } from "./playback.svelte.js";
	import {
		isPlayable,
		type ResolvedStream,
		type StreamKind,
		streamKind,
		streamMeta,
	} from "./stream-format.ts";
	import { playbackContext, resolveStreams } from "./watch.remote.ts";
	import { watchProviders } from "./watch-providers.remote.ts";
	import { EMPTY_PROVIDERS } from "./watch-providers.ts";
	import WatchProvidersList from "./watch-providers-list.svelte";

	let {
		type,
		videoId,
		onClose,
	}: {
		type: string;
		videoId: string;
		onClose: () => void;
	} = $props();

	const contextQuery = $derived(playbackContext({ type, id: videoId }));
	const heading = $derived(contextQuery.current?.heading ?? "Sources");
	const subheading = $derived(contextQuery.current?.subheading ?? null);

	// Official "where to watch" — shown prominently when no addon returns a
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

	function toggleKind(kind: StreamKind) {
		const next = new Set(kinds);
		if (next.has(kind)) {
			next.delete(kind);
		} else {
			next.add(kind);
		}
		kinds = next;
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

	const kindsPresent = $derived(new Set(rows.map((row) => row.kind)));
	const addons = $derived(
		[...new Set(rows.map((row) => row.addonName))].sort(),
	);
	const qualities = $derived(
		["4K", "1440p", "1080p", "720p", "480p", "360p"].filter((q) =>
			rows.some((row) => row.info.tags.includes(q)),
		),
	);
	const silentCount = $derived(
		rows.filter((row) => row.info.audio === "risky").length,
	);

	// Filter, then sink likely-silent sources (unsupported audio codec) to the
	// bottom — stable, so addon order is otherwise preserved.
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

	function pick(row: Row) {
		if (isPlayable(row)) {
			playbackHandoff.select(videoId, row, row.info.title);
			// The (watch) layout closes the drawer on `afterNavigate`.
			void goto(resolve(`player/${type}/${encodeURIComponent(videoId)}`));
		} else if (row.externalUrl) {
			window.open(row.externalUrl, "_blank", "noopener");
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key !== "Escape") {
			return;
		}
		if (filtersOpen) {
			filtersOpen = false;
		} else {
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

<svelte:window onkeydown={onKeydown}></svelte:window>

<button
	type="button"
	aria-label="Close sources"
	onclick={onClose}
	transition:fade={{ duration: 150 }}
	class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
></button>

{#if filtersOpen}
	<aside
		aria-label="Stream filters"
		transition:fly={{ x: 24, duration: 150 }}
		class="fixed inset-y-0 right-0 z-50 flex w-72 flex-col border-l border-border bg-background/80 shadow-2xl backdrop-blur-xl md:right-105 md:border-r md:border-l-0"
	>
		<header class="flex items-center justify-between border-b border-border p-4">
			<p class="text-sm font-semibold">Filters</p>
			<button
				type="button"
				aria-label="Close filters"
				onclick={() => filtersOpen = false}
				class="rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
			>
				<XIcon class="size-4" />
			</button>
		</header>

		<div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 scrollbar-thin">
			<section class="flex flex-col gap-2">
				<p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
					Source
				</p>
				<div class="flex gap-1.5">
					{#each [{ id: "direct", label: "Direct" }, { id: "p2p", label: "P2P" }] as const as opt (opt.id)}
						<button
							type="button"
							disabled={!kindsPresent.has(opt.id) && kinds.size === 0}
							onclick={() => toggleKind(opt.id)}
							class={cn(
								"flex-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-40",
								kinds.has(opt.id)
									? "border-primary bg-primary/10 text-primary"
									: "border-border text-muted-foreground hover:text-foreground",
							)}
						>
							{opt.label}
							{#if kindsPresent.has(opt.id)}
								<span class="text-[10px] opacity-60">
									{rows.filter((row) => row.kind === opt.id).length}
								</span>
							{/if}
						</button>
					{/each}
				</div>
				<p class="text-[11px] text-muted-foreground">
					P2P sources stream over BitTorrent and don't play directly in the
					browser.
				</p>
			</section>

			{#if qualities.length > 0}
				<section class="flex flex-col gap-2">
					<p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Quality
					</p>
					<div class="flex flex-wrap gap-1.5">
						<button
							type="button"
							onclick={() => quality = null}
							class={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition", quality === null
								? "border-primary bg-primary/10 text-primary"
									: "border-border text-muted-foreground hover:text-foreground",
							)}
						>
							Any
						</button>
						{#each qualities as q (q)}
							<button
								type="button"
								onclick={() => quality = quality === q ? null : q}
								class={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition", quality === q
									? "border-primary bg-primary/10 text-primary"
										: "border-border text-muted-foreground hover:text-foreground",
								)}
							>
								{q}
							</button>
						{/each}
					</div>
				</section>
			{/if}

			{#if addons.length > 1}
				<section class="flex flex-col gap-2">
					<p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Addon
					</p>
					<div class="flex flex-wrap gap-1.5">
						<button
							type="button"
							onclick={() => addonFilter = null}
							class={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition", addonFilter === null
								? "border-primary bg-primary/10 text-primary"
									: "border-border text-muted-foreground hover:text-foreground",
							)}
						>
							All
						</button>
						{#each addons as addon (addon)}
							<button
								type="button"
								onclick={() => addonFilter = addonFilter === addon ? null : addon}
								class={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition", addonFilter === addon
									? "border-primary bg-primary/10 text-primary"
										: "border-border text-muted-foreground hover:text-foreground",
								)}
							>
								{addon}
							</button>
						{/each}
					</div>
				</section>
			{/if}

			{#if silentCount > 0}
				<section class="flex flex-col gap-2">
					<p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
						Likely-silent
					</p>
					<button
						type="button"
						role="switch"
						aria-checked={showSilent}
						onclick={() => showSilent = !showSilent}
						class={cn("flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition", showSilent
							? "border-primary bg-primary/10 text-primary"
								: "border-border text-muted-foreground hover:text-foreground",
						)}
					>
						<span
							class={cn(
								"flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
								showSilent
									? "border-primary bg-primary text-primary-foreground"
									: "border-muted-foreground/50",
							)}
						>
							{#if showSilent}<CheckIcon class="size-2.5" />{/if}
						</span>
						Show {silentCount} likely-silent source{silentCount === 1 ? "" : "s"}
					</button>
					<p class="text-[11px] text-muted-foreground">
						Their audio codec (Dolby / DTS / Atmos) can't be decoded by the
						browser — video plays without sound.
					</p>
				</section>
			{/if}

			<button
				type="button"
				onclick={resetFilters}
				class="mt-auto rounded-md border border-border py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
			>
				Reset filters
			</button>
		</div>
	</aside>
{/if}

<div
	use:modal
	role="dialog"
	aria-modal="true"
	aria-label="Sources"
	transition:fly={{ x: 480, duration: 260, easing: cubicOut }}
	class="fixed inset-y-0 right-0 z-50 flex w-full max-w-105 flex-col border-l border-border bg-background/80 shadow-2xl backdrop-blur-xl"
>
	<header class="flex items-start gap-3 border-b border-border p-4">
		<div class="min-w-0 flex-1">
			<p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sources</p>
			<p class="truncate text-sm font-semibold">{heading}</p>
			{#if subheading}
				<p class="truncate text-xs text-muted-foreground">{subheading}</p>
			{/if}
		</div>
		<button
			type="button"
			aria-label="Close"
			onclick={onClose}
			class="rounded-md p-1.5 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
		>
			<XIcon class="size-4" />
		</button>
	</header>

	<div class="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
		<span class="text-xs font-medium text-muted-foreground">
			{result ? `${shown.length} of ${rows.length}` : "Loading…"}
		</span>
		<div class="flex items-center gap-1">
			<button
				type="button"
				disabled={!result || rows.length === 0}
				onclick={() => filtersOpen = !filtersOpen}
				class={cn("flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition disabled:opacity-50", filtersOpen || activeFilters > 0
					? "text-primary"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<SlidersHorizontalIcon class="size-3.5" />
				Filters
				{#if activeFilters > 0}
					<span
						class="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
					>
						{activeFilters}
					</span>
				{/if}
			</button>
			<button
				type="button"
				disabled={refreshing || !result}
				onclick={refresh}
				class="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
			>
				<RefreshCwIcon class={cn("size-3.5", refreshing && "animate-spin")} />
				Refresh
			</button>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
		{#if streamsQuery.error}
			<div class="flex flex-col items-center gap-3 py-12 text-center">
				<p class="text-sm font-medium">Couldn't reach your addons</p>
				<button
					type="button"
					onclick={refresh}
					class="rounded-md bg-foreground/5 px-3 py-1.5 text-sm font-medium hover:bg-foreground/10"
				>
					Try again
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
					<WatchProvidersList providers={providers} heading="Watch officially" />
				{/if}
				<div class="flex flex-col items-center gap-2 py-8 text-center">
					<p class="text-sm font-medium">No addon streams</p>
					<p class="max-w-60 text-xs text-muted-foreground">
						No installed addon returned a playable stream.
						{#if result.errors.length > 0}
							{result.errors.length} addon(s) errored.
						{/if}
					</p>
					<button
						type="button"
						onclick={refresh}
						class="mt-1 rounded-md bg-foreground/5 px-3 py-1.5 text-sm font-medium hover:bg-foreground/10"
					>
						Check again
					</button>
				</div>
			</div>
		{:else if shown.length === 0}
			<div class="flex flex-col items-center gap-2 px-4 py-10 text-center">
				<p class="text-sm font-medium">
					{rows.length} source{rows.length === 1 ? "" : "s"} hidden
				</p>
				<p class="max-w-64 text-xs text-muted-foreground">
					Every source for this title is P2P or likely-silent — the default
					filters hide those.
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
					Show all sources
				</button>
			</div>
		{:else}
			<div class="flex flex-col gap-1.5">
				{#each shown as row (row.index)}
					{@const m = row.info}
					{@const playable = isPlayable(row)}
					<button
						type="button"
						disabled={!playable && !row.externalUrl}
						onclick={() => pick(row)}
						class="group/row flex items-start gap-3 rounded-lg border border-border bg-card p-2.5 text-left transition-all enabled:hover:border-primary/40 enabled:hover:bg-card disabled:opacity-50"
					>
						<span
							class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-muted-foreground transition-colors group-enabled/row:group-hover/row:bg-primary group-enabled/row:group-hover/row:text-primary-foreground"
						>
							{#if playable}
								<PlayIcon class="size-3.5 fill-current" />
							{:else}
								<ExternalLinkIcon class="size-3.5" />
							{/if}
						</span>
						<div class="min-w-0 flex-1">
							<p
								class="line-clamp-2 text-xs font-medium leading-snug"
							>{m.title}</p>

							<div
								class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground"
							>
								<span
									class="flex items-center gap-0.5 font-medium text-foreground/70"
								><PuzzleIcon class="size-2.5" />{row.addonName}</span>

								{#if m.quality}
									<span class="rounded bg-foreground/10 px-1 py-px font-medium text-foreground/80">
										{m.quality}
									</span>
								{/if}
								{#if m.source}<span class="rounded bg-foreground/5 px-1 py-px">{m.source}</span>{/if}
								{#if m.videoCodec}<span class="rounded bg-foreground/5 px-1 py-px">{m.videoCodec}</span>{/if}
								{#if m.hdr}<span class="rounded bg-foreground/5 px-1 py-px">{m.hdr}</span>{/if}
								{#if m.tenBit}<span class="rounded bg-foreground/5 px-1 py-px">10-bit</span>{/if}
								{#if m.audioCodec}<span class="rounded bg-foreground/5 px-1 py-px">{m.audioCodec}</span>{/if}
								{#each m.languages as lang (lang)}
									<span class="rounded bg-foreground/5 px-1 py-px">{lang}</span>
								{/each}

								{#if m.size}<span class="text-foreground/60">{m.size}</span>{/if}
								{#if row.kind === "p2p" && m.seeders != null}
									<span class="flex items-center gap-0.5">
										<UsersIcon class="size-2.5" />{m.seeders}
									</span>
								{/if}
								{#if row.kind === "p2p"}
									<span class="rounded bg-foreground/5 px-1 py-px">P2P</span>
								{/if}

								{#if playable && m.audio === "risky"}
									<span
										class="flex items-center gap-0.5 rounded bg-warning/15 px-1 py-px text-warning-foreground"
										title="This audio codec may not play in the browser (no sound)"
									>
										<VolumeXIcon class="size-2.5" /> may be silent
									</span>
								{/if}
								{#if playable && m.video === "risky"}
									<span
										class="flex items-center gap-0.5 rounded bg-warning/15 px-1 py-px text-warning-foreground"
										title="This video codec (HEVC / AV1) may not decode in the browser"
									>
										<FilmIcon class="size-2.5" /> may not play
									</span>
								{/if}
								{#if !playable}<span class="rounded bg-warning/15 px-1 py-px text-warning-foreground">external</span>{/if}
							</div>
						</div>
					</button>
				{/each}
			</div>

			{#if result.errors.length > 0}
				<p class="mt-3 text-[11px] text-muted-foreground">
					{result.errors.map((entry) => entry.addonName).join(", ")} didn't respond.
				</p>
			{/if}

			{#if hasOfficial}
				<div class="mt-5 border-t border-border/60 pt-4"><WatchProvidersList providers={providers} /></div>
			{/if}
		{/if}
	</div>
</div>
