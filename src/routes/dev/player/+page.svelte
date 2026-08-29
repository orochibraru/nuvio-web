<script lang="ts">
	import { page } from "$app/state";
	import VideoPlayer from "$lib/components/video-player.svelte";

	const src = $derived(page.url.searchParams.get("src") ?? "/e2e/sample.webm");
	const start = $derived(Number(page.url.searchParams.get("start") ?? "0"));

	let lastProgress = $state<{ position: number; duration: number } | null>(
		null,
	);
	let ended = $state(false);
</script>

<div class="mx-auto max-w-4xl p-6">
	<VideoPlayer
		{src}
		title="Player harness"
		subheading="dev only"
		startTime={start}
		onProgress={(position, duration) => (lastProgress = { position, duration })}
		onEnded={() => (ended = true)}
	/>
	<p data-testid="last-progress">{lastProgress ? `${lastProgress.position}/${lastProgress.duration}` : ""}</p>
	<p data-testid="ended">{ended ? "ended" : ""}</p>
</div>
