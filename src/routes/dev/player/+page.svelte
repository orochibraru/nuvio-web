<script lang="ts">
	import { page } from "$app/state";
	import VideoPlayer from "$lib/components/video-player.svelte";

	const src = $derived(page.url.searchParams.get("src") ?? "/e2e/sample.webm");
	const start = $derived(Number(page.url.searchParams.get("start") ?? "0"));
	const numParam = (name: string) => {
		const raw = page.url.searchParams.get(name);
		return raw === null ? null : Number(raw);
	};
	const introStart = $derived(numParam("introStart"));
	const introEnd = $derived(numParam("introEnd"));
	const outroStart = $derived(numParam("outroStart"));

	let lastProgress = $state<{ position: number; duration: number } | null>(
		null,
	);
	let ended = $state(false);
	let outro = $state(false);
	let minimized = $state(false);
</script>

<div class="mx-auto max-w-4xl p-6">
	<VideoPlayer
		{src}
		title="Player harness"
		subheading="dev only"
		startTime={start}
		{introStart}
		{introEnd}
		{outroStart}
		{minimized}
		onProgress={(position, duration) => (lastProgress = { position, duration })}
		onEnded={() => (ended = true)}
		onOutro={() => {
			outro = true;
			minimized = true;
		}}
	/>
	<p data-testid="last-progress">{lastProgress ? `${lastProgress.position}/${lastProgress.duration}` : ""}</p>
	<p data-testid="ended">{ended ? "ended" : ""}</p>
	<p data-testid="outro">{outro ? "outro" : ""}</p>
</div>
