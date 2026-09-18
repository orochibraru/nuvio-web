<script lang="ts">
	import DownloadButton from "#lib/downloads/download-button.svelte";
	import DownloadList from "#lib/downloads/download-list.svelte";
	import { downloads, playbackUrl } from "#lib/downloads/manager.svelte.js";
	import { page } from "$app/state";

	// Drives the real button, manager, worker and service worker against the
	// fixtures in `static/e2e/`, under a throwaway owner : the e2e account has
	// no stream addon to download from.
	const src = $derived(page.url.searchParams.get("src") ?? "/e2e/sample.webm");
	const videoId = $derived(page.url.searchParams.get("id") ?? "tt0000001");

	$effect(() => {
		void downloads.attach("e2e:harness");
	});
</script>

<main class="flex flex-col gap-4 p-6">
	<h1 class="text-xl font-semibold">Downloads harness</h1>
	<div class="flex h-10">
		<DownloadButton
			context={{
				metaType: "movie",
				contentId: videoId,
				videoId,
				season: null,
				episode: null,
				heading: `Sample ${videoId}`,
				subheading: null,
				poster: null,
				background: null,
			}}
			url={new URL(src, page.url.origin).href}
			label="Sample"
			addonName="e2e"
		/>
	</div>
	<DownloadList
		items={downloads.items}
		onPlay={() => undefined}
		manage={{
			pause: (id) => downloads.pause(id),
			resume: (id) => downloads.resume(id),
			remove: (id) => void downloads.remove(id),
		}}
	/>
	<ul>
		{#each downloads.items as item (item.id)}
			{@const local = playbackUrl(item)}
			{#if local}
				<li data-video={item.videoId} data-local={local}>{item.videoId}</li>
			{/if}
		{/each}
	</ul>
</main>
