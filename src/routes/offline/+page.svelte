<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import WifiOffIcon from "@lucide/svelte/icons/wifi-off";
	import Hls from "hls.js";
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
	import { languageName } from "#lib/player/format.js";
	import { vttBlobUrl } from "#lib/player/subtitles.js";
	import { resolve } from "$app/paths";

	/**
	 * What the app is without a network: the last signed-in profile's finished
	 * downloads, and a plain player for them. No session, no addons, no sync :
	 * watch progress made here isn't recorded.
	 */

	pageTitle.set("Offline");

	let items = $state<DownloadRecord[]>([]);
	let loaded = $state(false);
	let playing = $state<DownloadRecord | null>(null);
	let tracks = $state<Array<{ src: string; lang: string; label: string }>>([]);

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

	// Subtitles are stored as SRT; `<track>` wants WebVTT.
	$effect(() => {
		const record = playing;
		if (!record) {
			return;
		}
		const urls: string[] = [];
		let cancelled = false;
		void (async () => {
			const next = [];
			for (const subtitle of playbackSubtitles(record)) {
				try {
					// biome-ignore lint/performance/noAwaitInLoops: a handful of local files
					const response = await fetch(subtitle.url);
					const src = vttBlobUrl(await response.text());
					urls.push(src);
					next.push({
						src,
						lang: subtitle.lang,
						label: languageName(subtitle.lang),
					});
				} catch {
					// A missing subtitle file just isn't offered.
				}
			}
			if (!cancelled) {
				tracks = next;
			}
		})();
		return () => {
			cancelled = true;
			tracks = [];
			for (const url of urls) {
				URL.revokeObjectURL(url);
			}
		};
	});

	/** hls.js for a playlist (where the browser can't play one natively). */
	function source(src: string) {
		return (video: HTMLVideoElement) => {
			if (src.endsWith(".m3u8") && Hls.isSupported()) {
				const hls = new Hls();
				hls.loadSource(src);
				hls.attachMedia(video);
				return () => hls.destroy();
			}
			video.src = src;
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
		<div class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Back to downloads"
					onclick={() => (playing = null)}
				>
					<ArrowLeftIcon />
				</Button>
				<div class="min-w-0">
					<h1 class="truncate text-lg font-semibold">{playing.title}</h1>
					{#if playing.subtitle}
						<p class="truncate text-sm text-muted-foreground">
							{playing.subtitle}
						</p>
					{/if}
				</div>
			</div>
			{#if src}
				{#key src}
					<!-- svelte-ignore a11y_media_has_caption : tracks are added when the download has subtitles -->
					<video
						{@attach source(src)}
						class="aspect-video w-full rounded-xl bg-black"
						controls
						autoplay
						playsinline
						poster={playing.background ?? undefined}
					>
						{#each tracks as track (track.src)}
							<track
								kind="subtitles"
								src={track.src}
								srclang={track.lang}
								label={track.label}
							/>
						{/each}
					</video>
				{/key}
			{/if}
		</div>
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
