<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PlayIcon from "@lucide/svelte/icons/play";
	import { getStreams } from "$lib/addons/addons.remote";
	import type { StreamWithSource } from "$lib/addons/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";

	let { type, id }: { type: string; id: string } = $props();

	const query = $derived(getStreams({ type, id }));

	function label(stream: StreamWithSource): string {
		return stream.name || stream.title || stream.description || "Stream";
	}

	function detail(stream: StreamWithSource): string | undefined {
		if (stream.name && (stream.description || stream.title)) {
			return stream.description || stream.title;
		}
		return undefined;
	}

	function playable(stream: StreamWithSource): string | null {
		if (stream.behaviorHints?.notWebReady) {
			return null;
		}
		return stream.url ?? stream.externalUrl ?? null;
	}
</script>

<div class="flex flex-col gap-2">
	{#if query.error}
		<p class="text-sm text-destructive">Couldn't load streams.</p>
	{:else if !query.current}
		{#each { length: 4 } as _row, index (index)}
			<div class="h-14 animate-pulse rounded-lg bg-muted"></div>
		{/each}
	{:else if query.current.streams.length === 0}
		<p class="text-sm text-muted-foreground">
			No streams found.
			{#if query.current.errors.length > 0}
				{query.current.errors.length} addon(s) errored.
			{/if}
		</p>
	{:else}
		{#each query.current.streams as stream, index (index)}
			{@const href = playable(stream)}
			<div class="flex items-center gap-3 rounded-lg border border-border p-3">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="truncate text-sm font-medium">{label(stream)}</span>
						<Badge variant="secondary" class="shrink-0 text-[10px]">{stream.addonName}</Badge>
						{#if stream.behaviorHints?.notWebReady}
							<Badge variant="secondary" class="shrink-0 text-[10px]">not web-ready</Badge>
						{/if}
					</div>
					{#if detail(stream)}
						<p class="truncate text-xs text-muted-foreground">{detail(stream)}</p>
					{/if}
				</div>
				{#if href}
					<a
						{href}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
					>
						{#if stream.url}
							<PlayIcon class="size-4" /> Play
						{:else}
							<ExternalLinkIcon class="size-4" /> Open
						{/if}
					</a>
				{:else}
					<span class="shrink-0 text-xs text-muted-foreground">unavailable in browser</span>
				{/if}
			</div>
		{/each}
	{/if}
</div>
