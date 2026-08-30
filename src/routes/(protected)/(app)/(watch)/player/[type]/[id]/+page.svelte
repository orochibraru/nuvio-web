<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PlayIcon from "@lucide/svelte/icons/play";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import PlaybackLoading from "$lib/components/playback-loading.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import VideoPlayer from "$lib/components/video-player.svelte";
	import { saveUiSettings } from "$lib/settings/settings.remote";
	import { theme } from "$lib/settings/theme.svelte";
	import type { UiSettings } from "$lib/settings/ui-settings.js";
	import { sync } from "$lib/sync/store.svelte.js";
	import { playbackHandoff } from "$lib/watch/playback.svelte.js";
	import { sourcesPanel } from "$lib/watch/sources-panel.svelte.js";
	import { describeStream, isPlayable } from "$lib/watch/stream-format.js";
	import { getSubtitles, resolveStreams } from "$lib/watch/watch.remote";

	let { data } = $props();

	const context = $derived(data.context);
	const type = $derived(page.params.type ?? "movie");
	const id = $derived(page.params.id ?? "");

	// The source drawer, shared with /detail through the (watch) layout.
	function openSources() {
		sourcesPanel.open(type, id);
	}

	// The stream picked on /streams; on a cold load, resolve one here.
	const handed = $derived(playbackHandoff.take(id));
	const streamsQuery = $derived(
		handed ? undefined : resolveStreams({ type, id }),
	);
	const autoStream = $derived(
		streamsQuery?.current?.streams.find(isPlayable) ??
			streamsQuery?.current?.streams[0] ??
			null,
	);

	const active = $derived.by(() => {
		if (handed) {
			return handed;
		}
		if (autoStream) {
			return {
				url: autoStream.url,
				externalUrl: autoStream.externalUrl,
				notWebReady: autoStream.notWebReady,
				label: describeStream(autoStream).title,
				addonName: autoStream.addonName,
			};
		}
		return null;
	});

	const playableSrc = $derived(
		active && !active.notWebReady ? (active.url ?? null) : null,
	);
	const resolving = $derived(!handed && !streamsQuery?.current);

	let resumeDecision = $state<"pending" | "resume" | "restart">("restart");
	$effect(() => {
		resumeDecision = context.resume ? "pending" : "restart";
	});
	const startTime = $derived(
		resumeDecision === "resume" && context.resume
			? context.resume.position / 1000
			: 0,
	);

	const subtitlesQuery = $derived(
		playableSrc
			? getSubtitles({ type: context.metaType, id: context.videoId })
			: undefined,
	);

	function saveSubtitleAppearance(patch: Partial<UiSettings>) {
		const next = { ...theme.current, ...patch };
		theme.preview(next);
		void saveUiSettings(next);
	}

	function report(position: number, duration: number) {
		sync.saveProgress({
			contentId: context.contentId,
			contentType: context.metaType,
			videoId: context.videoId,
			season: context.season,
			episode: context.episode,
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

	function playerHref(videoId: string): string {
		return `/player/series/${encodeURIComponent(videoId)}`;
	}

	// "Up next" autoplay after an episode ends.
	let upNextCountdown = $state<number | null>(null);
	let countdownTimer: ReturnType<typeof setInterval> | undefined;

	function cancelUpNext() {
		clearInterval(countdownTimer);
		upNextCountdown = null;
	}

	function startUpNext() {
		if (!context.next || !theme.current.autoPlayNext) {
			return;
		}
		upNextCountdown = 10;
		countdownTimer = setInterval(() => {
			if (upNextCountdown == null) {
				return;
			}
			upNextCountdown -= 1;
			if (upNextCountdown <= 0) {
				const target = context.next;
				cancelUpNext();
				if (target) {
					void goto(playerHref(target.videoId));
				}
			}
		}, 1000);
	}

	$effect(() => {
		void page.params.id;
		return cancelUpNext;
	});
</script>

<svelte:head><title>{context.heading} · Nuvio</title></svelte:head>

<div class="fixed inset-0 z-40 flex items-center justify-center bg-black text-white">
	<h1 class="sr-only">{context.heading}</h1>

	{#if !playableSrc && (context.background ?? context.poster)}
		<img
			src={context.background ?? context.poster}
			alt=""
			class="pointer-events-none absolute inset-0 size-full scale-105 object-cover opacity-25 blur-[2px]"
		/>
	{/if}

	{#if playableSrc}
		{#key `${playableSrc}:${resumeDecision}`}
			<VideoPlayer
				src={playableSrc}
				fill
				poster={context.background ?? context.poster}
				logo={context.logo}
				title={context.heading}
				subheading={active?.label ?? context.subheading}
				{startTime}
				subtitles={subtitlesQuery?.current ?? []}
				certification={context.certification}
				genres={context.genres}
				subtitleSize={theme.current.subtitleSize}
				subtitleColor={theme.current.subtitleColor}
				subtitleBackground={theme.current.subtitleBackground}
				preferredLanguage={theme.current.subtitleLanguage}
				onProgress={report}
				onEnded={startUpNext}
				onBack={() => history.back()}
				onSources={openSources}
				onSubtitleAppearance={saveSubtitleAppearance}
			/>
		{/key}

		{#if resumeDecision === "pending" && context.resume}
			<div
				class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 text-center backdrop-blur-sm"
			>
				<p class="text-sm text-white/80">You left off at {fmt(context.resume.position)}</p>
				<div class="flex gap-2">
					<Button size="lg" onclick={() => (resumeDecision = "resume")}>Resume</Button>
					<Button size="lg" variant="secondary" onclick={() => (resumeDecision = "restart")}>
						Start over
					</Button>
				</div>
			</div>
		{/if}

		{#if upNextCountdown != null && context.next}
			{@const upNext = context.next}
			<div
				class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center backdrop-blur-sm"
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
					<Button size="lg" onclick={() => goto(playerHref(upNext.videoId))}>
						<PlayIcon data-icon="inline-start" class="fill-current" />
						Play now ({upNextCountdown})
					</Button>
					<Button size="lg" variant="secondary" onclick={cancelUpNext}>Cancel</Button>
				</div>
			</div>
		{/if}
	{:else if resolving}
		<PlaybackLoading
			backdrop={context.background ?? context.poster}
			logo={context.logo}
			title={context.heading}
			certification={context.certification}
			genres={context.genres}
			label="Finding a stream…"
		/>
	{:else}
		<div class="relative z-10 flex max-w-sm flex-col items-center gap-4 px-6 text-center">
			<p class="text-lg font-semibold">
				{active ? "This source can't play in the browser" : "No playable stream"}
			</p>
			<p class="text-sm text-white/60">
				{active
					? "Pick a different source, or open it in an external player."
					: "None of your addons returned a stream that plays here."}
			</p>
			<div class="flex flex-wrap items-center justify-center gap-2">
				<Button onclick={openSources}>Choose a source</Button>
				{#if active?.externalUrl}
					<Button
						variant="secondary"
						href={active.externalUrl}
						target="_blank"
						rel="noopener noreferrer"
					>
						<ExternalLinkIcon data-icon="inline-start" /> Open externally
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
