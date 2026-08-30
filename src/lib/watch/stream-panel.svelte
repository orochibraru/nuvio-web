<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import VolumeXIcon from "@lucide/svelte/icons/volume-x";
	import XIcon from "@lucide/svelte/icons/x";
	import { goto } from "$app/navigation";
	import { cn } from "$lib/utils.js";
	import { playbackHandoff } from "./playback.svelte.js";
	import {
		describeStream,
		formatFileSize,
		isPlayable,
		type ResolvedStream,
	} from "./stream-format.js";
	import { playbackContext, resolveStreams } from "./watch.remote";

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

	const streamsQuery = $derived(resolveStreams({ type, id: videoId }));
	const result = $derived(streamsQuery.current);

	let refreshing = $state(false);
	let addonFilter = $state<string | null>(null);
	let qualityFilter = $state<string | null>(null);

	// Reset filters whenever the target video changes.
	$effect(() => {
		void videoId;
		addonFilter = null;
		qualityFilter = null;
	});

	type Row = ResolvedStream & { info: ReturnType<typeof describeStream> };

	const rows = $derived<Row[]>(
		(result?.streams ?? []).map((stream) => ({
			...stream,
			info: describeStream(stream),
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

	const shown = $derived(
		rows.filter(
			(row) =>
				(!addonFilter || row.addonName === addonFilter) &&
				(!qualityFilter || row.info.tags.includes(qualityFilter)),
		),
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
			void goto(`/player/${type}/${encodeURIComponent(videoId)}`);
		} else if (row.externalUrl) {
			window.open(row.externalUrl, "_blank", "noopener");
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<button
	type="button"
	aria-label="Close sources"
	onclick={onClose}
	class="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
></button>

<aside
	aria-label="Sources"
	class="fixed inset-y-0 right-0 z-50 flex w-full max-w-105 flex-col border-l border-border bg-background shadow-2xl"
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

	<div class="flex items-center justify-between border-b border-border px-4 py-2.5">
		<span class="text-xs font-medium text-muted-foreground">
			{result ? `${shown.length} of ${rows.length}` : "Loading…"}
		</span>
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

	{#if result && rows.length > 0 && (addons.length > 1 || qualities.length > 1)}
		<div class="flex flex-col gap-2 border-b border-border p-3">
			{#if addons.length > 1}
				<div class="no-scrollbar flex gap-1.5 overflow-x-auto">
					<button
						type="button"
						onclick={() => (addonFilter = null)}
						class={cn(
							"shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition",
							addonFilter === null
								? "bg-primary text-primary-foreground"
								: "bg-foreground/5 text-muted-foreground hover:text-foreground",
						)}
					>
						All addons
					</button>
					{#each addons as addon (addon)}
						<button
							type="button"
							onclick={() => (addonFilter = addonFilter === addon ? null : addon)}
							class={cn(
								"flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition",
								addonFilter === addon
									? "bg-primary text-primary-foreground"
									: "bg-foreground/5 text-muted-foreground hover:text-foreground",
							)}
						>
							<PuzzleIcon class="size-3" />
							{addon}
						</button>
					{/each}
				</div>
			{/if}
			{#if qualities.length > 1}
				<div class="no-scrollbar flex gap-1.5 overflow-x-auto">
					<button
						type="button"
						onclick={() => (qualityFilter = null)}
						class={cn(
							"shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition",
							qualityFilter === null
								? "bg-secondary text-secondary-foreground"
								: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
						)}
					>
						Any
					</button>
					{#each qualities as quality (quality)}
						<button
							type="button"
							onclick={() =>
								(qualityFilter = qualityFilter === quality ? null : quality)}
							class={cn(
								"shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition",
								qualityFilter === quality
									? "bg-secondary text-secondary-foreground"
									: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
							)}
						>
							{quality}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

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
					<div class="skeleton h-14 rounded-lg"></div>
				{/each}
			</div>
		{:else if rows.length === 0}
			<div class="flex flex-col items-center gap-2 py-12 text-center">
				<p class="text-sm font-medium">No streams yet</p>
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
		{:else if shown.length === 0}
			<p class="py-10 text-center text-xs text-muted-foreground">
				No sources match those filters.
			</p>
		{:else}
			<div class="flex flex-col gap-1.5">
				{#each shown as row (row.index)}
					{@const size = formatFileSize(row.fileSize)}
					{@const playable = isPlayable(row)}
					<button
						type="button"
						disabled={!playable && !row.externalUrl}
						onclick={() => pick(row)}
						class="group/row flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-2.5 text-left transition-all enabled:hover:border-primary/40 enabled:hover:bg-card disabled:opacity-50"
					>
						<span
							class="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-muted-foreground transition-colors group-enabled/row:group-hover/row:bg-primary group-enabled/row:group-hover/row:text-primary-foreground"
						>
							{#if playable}
								<PlayIcon class="size-3.5 fill-current" />
							{:else}
								<ExternalLinkIcon class="size-3.5" />
							{/if}
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-xs font-medium">{row.info.title}</p>
							<div class="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
								<span class="flex items-center gap-0.5 font-medium text-foreground/70">
									<PuzzleIcon class="size-2.5" />
									{row.addonName}
								</span>
								{#each row.info.tags as tag (tag)}
									<span class="rounded bg-foreground/5 px-1 py-px">{tag}</span>
								{/each}
								{#if size}<span>{size}</span>{/if}
								{#if playable && row.info.audio === "risky"}
									<span
										class="flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-px text-amber-600 dark:text-amber-400"
										title="This audio codec may not play in the browser (no sound)"
									>
										<VolumeXIcon class="size-2.5" /> may be silent
									</span>
								{/if}
								{#if !playable}<span class="text-amber-500">external</span>{/if}
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
		{/if}
	</div>
</aside>
