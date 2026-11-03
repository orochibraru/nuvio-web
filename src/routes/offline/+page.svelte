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
	import { getLocale, m } from "#lib/i18n/index.js";
	import VideoPlayer from "#lib/player/components/video-player.svelte";
	import { sync } from "#lib/sync/store.svelte.js";
	import { resumePoint, resumeRowFor } from "#lib/watch/playback-context.js";
	import { resolve } from "$app/paths";

	/**
	 * What the app is without a network: the last signed-in profile's finished
	 * downloads, and the app's own player for them : minus what needs a server
	 * (info overlay, sources, episodes). Watch progress goes to the sync store,
	 * which queues it on the device until the app is back online.
	 */

	pageTitle.set(m.offline_title());
	// The shell was cached without cookies, so its `<html lang>` is whatever
	// the browser asked for at install time. The copy itself follows the
	// locale cookie (client-rendered, `ssr = false`): make `lang` agree.
	document.documentElement.lang = getLocale();

	let items = $state<DownloadRecord[]>([]);
	let loaded = $state(false);
	let playing = $state<DownloadRecord | null>(null);

	$effect(() => {
		const owner = lastDownloadsOwner();
		if (!owner) {
			loaded = true;
			return;
		}
		const separator = owner.lastIndexOf(":");
		void sync.attach(
			Number(owner.slice(separator + 1)),
			owner.slice(0, separator),
		);
		void listDownloads(owner).then((rows) => {
			items = rows.filter((row) => row.status === "done");
			loaded = true;
		});
	});

	function resumeAt(record: DownloadRecord): number {
		const resume = resumePoint(
			resumeRowFor(sync.progress, record.type, record.videoId),
		);
		return resume ? resume.position / 1000 : 0;
	}

	function progressFor(record: DownloadRecord) {
		return (position: number, duration: number) => {
			if (!sync.ready) {
				return;
			}
			sync.saveProgress({
				contentId: record.contentId,
				contentType: record.type,
				videoId: record.videoId,
				season: record.season,
				episode: record.episode,
				position: position * 1000,
				duration: duration * 1000,
			});
		};
	}
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
						startTime={resumeAt(playing)}
						onProgress={progressFor(playing)}
						onBack={() => (playing = null)}
					/>
				{/key}
			</div>
		{/if}
	{:else}
		<div class="flex flex-col gap-1">
			<h1 class="text-3xl font-bold tracking-tight">{m.offline_heading()}</h1>
			<p class="text-sm text-muted-foreground">
				{m.offline_body()}
			</p>
		</div>

		{#if loaded && items.length === 0}
			<EmptyState
				icon={WifiOffIcon}
				title={m.offline_empty_title()}
				description={m.offline_empty_description()}
			/>
		{:else}
			<DownloadList {items} onPlay={(record) => (playing = record)} />
		{/if}

		<Button variant="secondary" href={resolve("/(protected)/(app)")}>
			{m.common_try_again()}
		</Button>
	{/if}
</main>
