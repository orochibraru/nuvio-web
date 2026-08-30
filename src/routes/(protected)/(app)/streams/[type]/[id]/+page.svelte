<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import MonitorXIcon from "@lucide/svelte/icons/monitor-x";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import EmptyState from "$lib/components/empty-state.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { playbackHandoff } from "$lib/watch/playback.js";
	import {
		describeStream,
		formatFileSize,
		isPlayable,
		type ResolvedStream,
	} from "$lib/watch/stream-format.js";
	import { resolveStreams } from "$lib/watch/watch.remote";

	let { data } = $props();

	const context = $derived(data.context);
	const type = $derived(page.params.type ?? "movie");
	const id = $derived(page.params.id ?? "");

	const streamsQuery = $derived(resolveStreams({ type, id }));
	const result = $derived(streamsQuery.current);

	let refreshing = $state(false);
	async function refresh() {
		refreshing = true;
		try {
			await streamsQuery.refresh();
		} finally {
			refreshing = false;
		}
	}

	function fmtResume(ms: number): string {
		const total = Math.floor(ms / 1000);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${m}:${String(s).padStart(2, "0")}`;
	}

	function pick(stream: ResolvedStream) {
		const { title } = describeStream(stream);
		if (isPlayable(stream)) {
			playbackHandoff.select(id, stream, title);
			void goto(`/player/${type}/${encodeURIComponent(id)}`);
		}
	}
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
	<button
		type="button"
		onclick={() => history.back()}
		class="flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
	>
		<ArrowLeftIcon class="size-4" /> Back
	</button>

	<div class="flex items-start gap-4">
		{#if context.poster}
			<img
				src={context.poster}
				alt=""
				class="hidden w-24 shrink-0 rounded-lg object-cover ring-1 ring-white/10 sm:block"
			/>
		{/if}
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-bold tracking-tight">{context.heading}</h1>
			{#if context.subheading}
				<p class="mt-0.5 text-sm text-muted-foreground">{context.subheading}</p>
			{/if}
			{#if context.resume}
				<p class="mt-2 text-sm text-primary">
					Resume from {fmtResume(context.resume.position)}
				</p>
			{/if}
		</div>
	</div>

	<div class="flex items-center justify-between">
		<h2 class="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
			{result ? `${result.streams.length} source${result.streams.length === 1 ? "" : "s"}` : "Finding sources"}
		</h2>
		<Button
			variant="ghost"
			size="sm"
			disabled={refreshing || !result}
			onclick={refresh}
		>
			<RefreshCwIcon
				data-icon="inline-start"
				class={refreshing ? "animate-spin" : ""}
			/>
			Refresh
		</Button>
	</div>

	{#if streamsQuery.error}
		<EmptyState
			icon={MonitorXIcon}
			title="Couldn't reach your addons"
			description="Something went wrong resolving streams. Try refreshing."
		>
			{#snippet actions()}
				<Button variant="outline" onclick={refresh}>Try again</Button>
			{/snippet}
		</EmptyState>
	{:else if !result}
		<div class="flex flex-col gap-2">
			{#each { length: 5 } as _skeleton, i (i)}
				<div class="skeleton h-16 rounded-xl"></div>
			{/each}
		</div>
	{:else if result.streams.length === 0}
		<EmptyState
			icon={MonitorXIcon}
			title="No streams yet"
			description={`No installed addon returned a playable stream.${
				result.errors.length > 0
					? ` ${result.errors.length} addon(s) errored.`
					: ""
			}`}
		>
			{#snippet actions()}
				<Button variant="outline" onclick={refresh}>Check again</Button>
				<Button href="/addons" variant="ghost">Manage addons</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="flex flex-col gap-2">
			{#each result.streams as stream (stream.index)}
				{@const info = describeStream(stream)}
				{@const size = formatFileSize(stream.fileSize)}
				{@const playable = isPlayable(stream)}
				<button
					type="button"
					disabled={!playable && !stream.externalUrl}
					onclick={() => pick(stream)}
					class="group/stream flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-3 text-left transition-all enabled:hover:border-primary/40 enabled:hover:bg-card disabled:opacity-50"
				>
					<span
						class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-muted-foreground transition-colors group-enabled/stream:group-hover/stream:bg-primary group-enabled/stream:group-hover/stream:text-primary-foreground"
					>
						{#if playable}
							<PlayIcon class="size-4 fill-current" />
						{:else}
							<ExternalLinkIcon class="size-4" />
						{/if}
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{info.title}</p>
						<div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
							<span class="rounded bg-foreground/5 px-1.5 py-0.5 font-medium">{stream.addonName}</span>
							{#each info.tags as tag (tag)}
								<span class="rounded bg-foreground/5 px-1.5 py-0.5">{tag}</span>
							{/each}
							{#if size}<span>{size}</span>{/if}
							{#if !playable}<span class="text-amber-500">external only</span>{/if}
						</div>
					</div>
				</button>
			{/each}
		</div>

		{#if result.errors.length > 0}
			<p class="text-xs text-muted-foreground">
				{result.errors.map((entry) => entry.addonName).join(", ")} didn't respond.
			</p>
		{/if}
	{/if}

	{#if context.next}
		<a
			href={`/streams/series/${encodeURIComponent(context.next.videoId)}`}
			class="group/next mt-2 flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-2.5 transition-all hover:border-primary/40 hover:bg-card"
		>
			<div class="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
				{#if context.next.thumbnail}
					<img src={context.next.thumbnail} alt="" class="size-full object-cover" />
				{/if}
			</div>
			<div class="min-w-0">
				<p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next episode</p>
				<p class="truncate text-sm font-medium">{context.next.label}</p>
			</div>
		</a>
	{/if}
</div>
