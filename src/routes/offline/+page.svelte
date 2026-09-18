<script lang="ts">
	import WifiOffIcon from "@lucide/svelte/icons/wifi-off";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import DownloadList from "#lib/downloads/download-list.svelte";
	import {
		lastDownloadsOwner,
		playbackUrl,
	} from "#lib/downloads/manager.svelte.js";
	import { listDownloads } from "#lib/downloads/store.js";
	import { playbackSubtitles } from "#lib/downloads/subtitles.js";
	import type { DownloadRecord } from "#lib/downloads/types.js";
	import VideoPlayer from "#lib/player/components/video-player.svelte";
	import { resolve } from "$app/paths";

	/**
	 * What the app is without a network: the last signed-in profile's finished
	 * downloads, and the app's own player for them : minus what needs a server
	 * (info overlay, sources, episodes). No session, no addons, no sync : watch
	 * progress made here isn't recorded.
	 */

	pageTitle.set("Offline");

	let items = $state<DownloadRecord[]>([]);
	let loaded = $state(false);
	let playing = $state<DownloadRecord | null>(null);

	$effect(() => {
		const owner = lastDownloadsOwner();
		if (!owner) {
			loaded = true;
			return;
		}
		void listDownloads(owner).then((rows) => {
			items = rows.filter((row) => row.status === "done");
			loaded = true;
		});
	});
</script>

<main class="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-8">
	<div class="flex items-center gap-3">
		<img src="/logo-text-dark.webp" alt="" class="h-6 dark:hidden" />
		<img src="/logo-text.webp" alt="" class="hidden h-6 dark:block" />
	</div>

	{#if playing}
		{@const src = playbackUrl(playing)}
		{#if src}
			<div class="dark fixed inset-0 z-40 bg-black text-white">
				<h1 class="sr-only">{playing.title}</h1>
				{#key src}
					<VideoPlayer
						{src}
						fill
						poster={playing.background}
						posterImage={playing.poster}
						title={playing.title}
						subheading={playing.subtitle}
						subtitles={playbackSubtitles(playing)}
						onBack={() => (playing = null)}
					/>
				{/key}
			</div>
		{/if}
	{:else}
		<div class="flex flex-col gap-1">
			<h1 class="text-3xl font-bold tracking-tight">You're offline</h1>
			<p class="text-sm text-muted-foreground">
				Your downloads still play. Everything else comes back with the
				connection.
			</p>
		</div>

		{#if loaded && items.length === 0}
			<EmptyState
				icon={WifiOffIcon}
				title="No downloads on this device"
				description="Download a title from its sources while you're online to watch it here."
			/>
		{:else}
			<DownloadList {items} onPlay={(record) => (playing = record)} />
		{/if}

		<Button variant="secondary" href={resolve("/(protected)/(app)")}>
			Try again
		</Button>
	{/if}
</main>
