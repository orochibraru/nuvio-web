<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import MonitorXIcon from "@lucide/svelte/icons/monitor-x";
	import PlayIcon from "@lucide/svelte/icons/play";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import type { StreamWithSource } from "$lib/addons/index.js";
	import EmptyState from "$lib/components/empty-state.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import VideoPlayer from "$lib/components/video-player.svelte";
	import { theme } from "$lib/settings/theme.svelte";
	import { sync } from "$lib/sync/store.svelte.js";
	import { cn } from "$lib/utils.js";
	import { getSubtitles } from "$lib/watch/watch.remote";

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
		sync.saveProgress({
			contentId: watch.contentId,
			contentType: watch.metaType,
			videoId: watch.videoId,
			season: watch.season,
			episode: watch.episode,
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

	function nextHref(videoId: string): string {
		return `/watch/series/${encodeURIComponent(videoId)}`;
	}

	// "Up next" autoplay after an episode ends.
	let upNextCountdown = $state<number | null>(null);
	let countdownTimer: ReturnType<typeof setInterval> | undefined;

	function cancelUpNext() {
		clearInterval(countdownTimer);
		upNextCountdown = null;
	}

	function startUpNext() {
		if (!watch.next || !theme.current.autoPlayNext) {
			return;
		}
		upNextCountdown = 10;
		countdownTimer = setInterval(() => {
			if (upNextCountdown == null) {
				return;
			}
			upNextCountdown -= 1;
			if (upNextCountdown <= 0) {
				const target = watch.next;
				cancelUpNext();
				if (target) {
					void goto(nextHref(target.videoId));
				}
			}
		}, 1000);
	}

	// Reset when navigating between episodes or leaving the player.
	$effect(() => {
		void page.params.id;
		return cancelUpNext;
	});
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-4">
	<button
		type="button"
		onclick={() => history.back()}
		class="flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-sm font-medium text-muted-foreground transition hover:text-foreground"
	>
		<ArrowLeftIcon class="size-4" /> Back
	</button>

	<div class="flex items-baseline justify-between gap-4">
		<h1 class="text-xl font-bold tracking-tight">{watch.heading}</h1>
		{#if watch.subheading}
			<span class="shrink-0 text-sm text-muted-foreground">{watch.subheading}</span>
		{/if}
	</div>

	{#if watch.streams.length === 0}
		<EmptyState
			icon={MonitorXIcon}
			title="No streams available"
			description={`No installed addon returned a stream for this title.${
				watch.streamErrors.length > 0
					? ` ${watch.streamErrors.length} addon(s) errored.`
					: ""
			}`}
		>
			{#snippet actions()}
				<Button href="/addons" variant="outline">Manage addons</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="relative overflow-hidden rounded-xl bg-black ring-1 ring-white/10 shadow-2xl">
			{#if resumeDecision === "pending" && watch.resume}
				<div
					class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 text-center text-white backdrop-blur-sm"
				>
					<p class="text-sm text-white/80">You left off at {fmt(watch.resume.position)}</p>
					<div class="flex gap-2">
						<Button size="lg" onclick={() => (resumeDecision = "resume")}>Resume</Button>
						<Button size="lg" variant="secondary" onclick={() => (resumeDecision = "restart")}>
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
						onEnded={startUpNext}
						onBack={() => history.back()}
					/>
				{/key}

				{#if upNextCountdown != null && watch.next}
					{@const upNext = watch.next}
					<div
						class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center text-white backdrop-blur-sm"
					>
						<p class="text-xs font-semibold tracking-[0.2em] text-white/60 uppercase">Up next</p>
						{#if upNext.thumbnail}
							<img
								src={upNext.thumbnail}
								alt=""
								class="aspect-video w-56 rounded-lg object-cover ring-1 ring-white/15"
							/>
						{/if}
						<p class="max-w-md text-sm font-medium">{upNext.label}</p>
						<div class="flex items-center gap-2">
							<Button size="lg" onclick={() => goto(nextHref(upNext.videoId))}>
								<PlayIcon data-icon="inline-start" class="fill-current" />
								Play now ({upNextCountdown})
							</Button>
							<Button size="lg" variant="secondary" onclick={cancelUpNext}>Cancel</Button>
						</div>
					</div>
				{/if}
			{:else}
				<div class="flex aspect-video flex-col items-center justify-center gap-3 text-center">
					<p class="text-sm text-white/70">
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

		{#if watch.next}
			<a
				href={nextHref(watch.next.videoId)}
				class="group/next flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-2.5 transition-all hover:border-primary/40 hover:bg-card"
			>
				<div class="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
					{#if watch.next.thumbnail}
						<img src={watch.next.thumbnail} alt="" class="size-full object-cover" />
					{/if}
					<span class="absolute inset-0 flex items-center justify-center bg-black/40">
						<PlayIcon class="size-5 fill-white text-white" />
					</span>
				</div>
				<div class="min-w-0">
					<p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Next episode</p>
					<p class="truncate text-sm font-medium">{watch.next.label}</p>
				</div>
			</a>
		{/if}

		{#if watch.streams.length > 1}
			<div class="flex flex-col gap-2">
				<p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sources</p>
				<div class="flex flex-col gap-1.5">
					{#each watch.streams as stream, index (index)}
						<button
							type="button"
							onclick={() => (chosenIndex = index)}
							class={cn(
								"flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
								index === chosenIndex
									? "border-primary/50 bg-primary/5"
									: "border-border/60 hover:border-border hover:bg-card",
							)}
						>
							<span class="min-w-0 flex-1 truncate font-medium">{streamLabel(stream)}</span>
							<span class="shrink-0 text-xs text-muted-foreground">{stream.addonName}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
