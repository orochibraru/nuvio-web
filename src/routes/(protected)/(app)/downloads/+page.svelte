<script lang="ts">
	import DownloadIcon from "@lucide/svelte/icons/download";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import DownloadList from "#lib/downloads/download-list.svelte";
	import { downloads } from "#lib/downloads/manager.svelte.js";
	import type { DownloadRecord } from "#lib/downloads/types.js";
	import { formatFileSize } from "#lib/watch/stream-format.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";

	pageTitle.set("Downloads");

	// Everything here is on this device (IndexedDB + the Origin Private File
	// System), so there is nothing for a server load to fetch.
	let estimate = $state<{ usage: number; quota: number } | null>(null);
	$effect(() => {
		// Re-read whenever the list changes size.
		void downloads.items.length;
		navigator.storage
			?.estimate?.()
			.then(({ usage = 0, quota = 0 }) => {
				estimate = { usage, quota };
			})
			.catch(() => {
				estimate = null;
			});
	});

	function play(record: DownloadRecord) {
		void goto(
			resolve(`player/${record.type}/${encodeURIComponent(record.videoId)}`),
		);
	}
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-bold tracking-tight">Downloads</h1>
		<p class="text-sm text-muted-foreground">
			Saved on this device, playable without a connection.
			{#if estimate}
				{formatFileSize(estimate.usage) ?? "0 B"} used of {formatFileSize(
					estimate.quota,
				) ?? "?"} available.
			{/if}
		</p>
	</div>

	{#if !downloads.supported}
		<EmptyState
			icon={DownloadIcon}
			title="Downloads aren't available here"
			description="This browser can't store files for offline viewing."
		/>
	{:else if downloads.ready && downloads.items.length === 0}
		<EmptyState
			icon={DownloadIcon}
			title="Nothing downloaded yet"
			description="Open a title's sources and use the download button next to one to watch it offline."
		/>
	{:else if downloads.ready}
		<DownloadList
			items={downloads.items}
			onPlay={play}
			manage={{
				pause: (id) => downloads.pause(id),
				resume: (id) => downloads.resume(id),
				remove: (id) => void downloads.remove(id),
			}}
		/>
	{/if}
</div>
