<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import { goto } from "$app/navigation";
	import type { StreamWithSource } from "$lib/addons/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import VideoPlayer from "$lib/components/video-player.svelte";
	import { cn } from "$lib/utils.js";
	import { getSubtitles, saveProgress } from "$lib/watch/watch.remote";

	let { data } = $props();

	const watch = $derived(data.watch);

	let chosenIndex = $state(0);
	const chosen = $derived<StreamWithSource | null>(
		watch.streams[chosenIndex] ?? watch.streams[0] ?? null,
	);
	const playableSrc = $derived(
		chosen && !chosen.behaviorHints?.notWebReady ? (chosen.url ?? null) : null,
	);
	const externalUrl = $derived(chosen?.url ?? chosen?.externalUrl ?? null);

	let resumeDecision = $state<"pending" | "resume" | "restart">("restart");
	$effect(() => {
		resumeDecision = watch.resume ? "pending" : "restart";
	});
	const startTime = $derived(
		resumeDecision === "resume" && watch.resume
			? watch.resume.position / 1000
			: 0,
	);

	const subtitlesQuery = $derived(
		chosen
			? getSubtitles({ type: watch.metaType, id: watch.videoId })
			: undefined,
	);

	function streamLabel(stream: StreamWithSource): string {
		return stream.name || stream.title || stream.description || "Stream";
	}

	function report(position: number, duration: number) {
		void saveProgress({
			contentId: watch.contentId,
			contentType: watch.metaType,
			videoId: watch.videoId,
			season: watch.season ?? undefined,
			episode: watch.episode ?? undefined,
			position: position * 1000,
			duration: duration * 1000,
		});
	}

	function fmt(ms: number): string {
		const total = Math.floor(ms / 1000);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${m}:${String(s).padStart(2, "0")}`;
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-4">
	<Button variant="ghost" size="sm" onclick={() => history.back()} class="-ml-2 self-start">
		<ArrowLeftIcon data-icon="inline-start" /> Back
	</Button>

	<div class="flex items-baseline justify-between">
		<h1 class="text-lg font-semibold">{watch.heading}</h1>
		{#if watch.subheading}
			<span class="text-sm text-muted-foreground">{watch.subheading}</span>
		{/if}
	</div>

	{#if watch.streams.length === 0}
		<div class="rounded-lg border border-border p-10 text-center">
			<p class="font-medium">No streams available</p>
			<p class="mt-1 text-sm text-muted-foreground">
				No installed addon returned a stream for this title.
				{#if watch.streamErrors.length > 0}
					{watch.streamErrors.length} addon(s) errored.
				{/if}
			</p>
			<Button href="/addons" variant="outline" class="mt-4">Manage addons</Button>
		</div>
	{:else}
		<div class="relative">
			{#if resumeDecision === "pending" && watch.resume}
				<div
					class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/80 text-center text-white"
				>
					<p class="text-sm">You were at {fmt(watch.resume.position)}</p>
					<div class="flex gap-2">
						<Button onclick={() => (resumeDecision = "resume")}>Resume</Button>
						<Button variant="secondary" onclick={() => (resumeDecision = "restart")}>
							Start over
						</Button>
					</div>
				</div>
			{/if}

			{#if playableSrc}
				{#key `${playableSrc}:${resumeDecision}`}
					<VideoPlayer
						src={playableSrc}
						poster={watch.poster}
						title={watch.heading}
						subheading={watch.subheading}
						{startTime}
						subtitles={subtitlesQuery?.current ?? []}
						onProgress={report}
						onBack={() => history.back()}
					/>
				{/key}
			{:else}
				<div class="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg bg-muted text-center">
					<p class="text-sm text-muted-foreground">
						This source can't play in the browser{chosen?.behaviorHints?.notWebReady
							? " (not web-ready)"
							: ""}.
					</p>
					{#if externalUrl}
						<a
							href={externalUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
						>
							<ExternalLinkIcon class="size-4" /> Open externally
						</a>
					{/if}
				</div>
			{/if}
		</div>

		{#if watch.streams.length > 1}
			<div class="flex flex-col gap-2">
				<p class="text-xs font-medium text-muted-foreground">Sources</p>
				<div class="flex flex-col gap-1">
					{#each watch.streams as stream, index (index)}
						<button
							type="button"
							onclick={() => (chosenIndex = index)}
							class={cn(
								"flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition",
								index === chosenIndex
									? "border-foreground"
									: "border-border hover:border-foreground/30",
							)}
						>
							<span class="min-w-0 flex-1 truncate">{streamLabel(stream)}</span>
							<span class="shrink-0 text-xs text-muted-foreground">{stream.addonName}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
