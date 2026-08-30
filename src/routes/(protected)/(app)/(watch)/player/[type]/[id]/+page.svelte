<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PlayIcon from "@lucide/svelte/icons/play";
	import { toast } from "svelte-sonner";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import PlaybackLoading from "$lib/components/playback-loading.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import VideoPlayer from "$lib/components/video-player.svelte";
	import { saveUiSettings } from "$lib/settings/settings.remote";
	import { theme } from "$lib/settings/theme.svelte";
	import type { UiSettings } from "$lib/settings/ui-settings.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { sync } from "$lib/sync/store.svelte.js";
	import { playbackHandoff } from "$lib/watch/playback.svelte.js";
	import PlayerEpisodesPanel from "$lib/watch/player-episodes-panel.svelte";
	import { sourcesPanel } from "$lib/watch/sources-panel.svelte.js";
	import {
		describeStream,
		pickPreferredStream,
	} from "$lib/watch/stream-format.js";
	import {
		getSubtitles,
		playbackContext,
		resolveStreams,
		titleProgress,
	} from "$lib/watch/watch.remote";

	const type = $derived(page.params.type ?? "movie");
	const id = $derived(page.params.id ?? "");

	// Meta / resume / next-episode context loads client-side so the click that
	// navigated here paints the player shell immediately (no server round-trip).
	const contextQuery = $derived(playbackContext({ type, id }));
	type PlaybackCtx = NonNullable<typeof contextQuery.current>;
	const contextReady = $derived(contextQuery.current !== undefined);
	const contextFallback = $derived({
		metaType: type === "series" ? "series" : "movie",
		contentId: id.split(":")[0] ?? id,
		season: null,
		episode: null,
		videoId: id,
		heading: "Loading…",
		subheading: null,
		background: null,
		poster: null,
		logo: null,
		certification: null,
		genres: [],
		episodes: [],
		next: null,
		resume: null,
	} satisfies PlaybackCtx);
	const context = $derived<PlaybackCtx>(
		contextQuery.current ?? contextFallback,
	);

	$effect(() => {
		if (contextReady) {
			pageTitle.set(context.heading);
		}
	});

	// The source drawer, shared with /detail through the (watch) layout.
	function openSources() {
		sourcesPanel.open(type, id);
	}

	// In-player episode drawer (series only).
	let episodesOpen = $state(false);
	const isSeries = $derived(context.metaType === "series");
	const hasEpisodes = $derived(isSeries && context.episodes.length > 0);
	const nextVideoId = $derived(context.next?.videoId ?? null);
	$effect(() => {
		void page.params.id;
		episodesOpen = false;
	});

	const episodeProgressQuery = $derived(
		hasEpisodes ? titleProgress({ contentId: context.contentId }) : undefined,
	);
	const episodeProgress = $derived(
		sync.authoritative
			? sync.titleProgress(context.contentId)
			: (episodeProgressQuery?.current ?? {}),
	);

	function playVideo(videoId: string) {
		episodesOpen = false;
		void goto(playerHref(videoId));
	}

	// The stream picked on /streams; on a cold load, resolve one here.
	const handed = $derived(playbackHandoff.take(id));
	const streamsQuery = $derived(
		handed ? undefined : resolveStreams({ type, id }),
	);
	const autoStream = $derived(
		pickPreferredStream(
			streamsQuery?.current?.streams ?? [],
			theme.current.preferredQuality,
		),
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

	// Always pick up where the viewer left off — no "resume vs start over" prompt.
	const startTime = $derived(
		context.resume ? context.resume.position / 1000 : 0,
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
		if (!contextReady) {
			return;
		}
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

	function goBack() {
		if (history.length > 1) {
			history.back();
		} else {
			void goto(`/detail/${type}/${encodeURIComponent(id)}`);
		}
	}

	// A stream that can't play here but has a direct URL — hand it to an
	// external player (VLC scheme / copy).
	const externalLink = $derived(
		active?.notWebReady ? (active.url ?? active.externalUrl) : null,
	);
	let copied = $state(false);
	async function copyStreamLink() {
		if (!externalLink) {
			return;
		}
		try {
			await navigator.clipboard.writeText(externalLink);
			copied = true;
			toast.success("Stream link copied");
			setTimeout(() => (copied = false), 2000);
		} catch {
			toast.error("Couldn't copy the link");
		}
	}
</script>

<div class="fixed inset-0 z-40 flex items-center justify-center bg-black text-white">
	<h1 class="sr-only">{context.heading}</h1>

	{#if !playableSrc}
		<button
			type="button"
			onclick={goBack}
			class="absolute top-4 left-4 z-20 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/20"
		>
			<ArrowLeftIcon class="size-4" /> Back
		</button>
	{/if}

	{#if !playableSrc && (context.background ?? context.poster)}
		<img
			src={context.background ?? context.poster}
			alt=""
			class="pointer-events-none absolute inset-0 size-full scale-105 object-cover opacity-25 blur-[2px]"
		/>
	{/if}

	{#if playableSrc}
		{#key playableSrc}
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
				onEpisodes={hasEpisodes ? () => (episodesOpen = true) : undefined}
				onNext={nextVideoId ? () => playVideo(nextVideoId) : undefined}
			/>
		{/key}

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
				{#if externalLink}
					<Button
						variant="secondary"
						href={`vlc://${externalLink}`}
					>
						<ExternalLinkIcon data-icon="inline-start" /> Open in VLC
					</Button>
					<Button variant="ghost" onclick={copyStreamLink}>
						<CopyIcon data-icon="inline-start" />
						{copied ? "Copied" : "Copy link"}
					</Button>
				{:else if active?.externalUrl}
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

	{#if episodesOpen && hasEpisodes}
		<PlayerEpisodesPanel
			episodes={context.episodes}
			currentVideoId={context.videoId}
			progress={episodeProgress}
			onClose={() => (episodesOpen = false)}
			onSelect={playVideo}
		/>
	{/if}
</div>
