<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import { toast } from "svelte-sonner";
	import { similarTitles } from "#lib/addons/addons.remote.js";
	import PlaybackLoading from "#lib/components/playback-loading.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import VideoPlayer from "#lib/components/video-player.svelte";
	import { saveUiSettings } from "#lib/settings/settings.remote.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { UiSettings } from "#lib/settings/ui-settings.js";
	import { pageTitle } from "#lib/stores/title.svelte.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { browserCanPlayCodec } from "#lib/watch/codec-support.js";
	import { playbackHandoff } from "#lib/watch/playback.svelte.js";
	import PlayerEpisodesPanel from "#lib/watch/player-episodes-panel.svelte";
	import { mediaSegments } from "#lib/watch/segments.remote.js";
	import { sourcesPanel } from "#lib/watch/sources-panel.svelte.js";
	import {
		audioSupport,
		describeStream,
		pickPreferredStream,
		riskyVideoCodec,
	} from "#lib/watch/stream-format.js";
	import {
		getSubtitles,
		playbackContext,
		resolveStreams,
		titleProgress,
	} from "#lib/watch/watch.remote.js";
	import { EMPTY_PROVIDERS } from "#lib/watch/watch-providers.js";
	import { watchProviders } from "#lib/watch/watch-providers.remote.js";
	import WatchProvidersList from "#lib/watch/watch-providers-list.svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

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
		info: {
			description: null,
			imdbRating: null,
			releaseInfo: null,
			runtime: null,
			status: null,
			country: null,
			awards: null,
			cast: [],
			director: [],
			writer: [],
			episodeTitle: null,
			episodeOverview: null,
		},
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

	// The chosen stream's label names a video codec (HEVC / AV1 / Xvid); ask the
	// browser whether it can actually decode it before we bother mounting <video>.
	const videoCodec = $derived(
		handed
			? handed.videoCodec
			: autoStream
				? riskyVideoCodec(autoStream)
				: null,
	);
	const codecBlocked = $derived(
		browserCanPlayCodec(videoCodec) === "unsupported",
	);

	const playableSrc = $derived(
		active && !active.notWebReady && !codecBlocked
			? (active.url ?? null)
			: null,
	);
	const resolving = $derived(!(handed || streamsQuery?.current));

	// Official "where to watch" — the fallback when no addon stream plays here.
	const providersQuery = $derived(
		contextReady
			? watchProviders({
					title: context.heading,
					year: Number((context.info.releaseInfo ?? "").slice(0, 4)) || null,
					imdbId: /^tt\d+$/.test(context.contentId) ? context.contentId : null,
					region: theme.current.watchRegion,
				})
			: undefined,
	);
	const providers = $derived(providersQuery?.current ?? EMPTY_PROVIDERS);
	const officialCta = $derived(providers.stream[0] ?? null);

	// The chosen stream's label hints at a codec the browser can't decode for
	// audio — used to make the player's no-sound detection more eager.
	const audioRisky = $derived(
		handed
			? handed.audioRisky
			: autoStream
				? audioSupport(autoStream) === "risky"
				: false,
	);

	// Bumped by "Watch again" to remount the player and replay from the start.
	let replayNonce = $state(0);

	// Always pick up where the viewer left off — no "resume vs start over" prompt.
	// "Watch again" (replayNonce > 0) restarts from the top.
	const startTime = $derived(
		replayNonce === 0 && context.resume ? context.resume.position / 1000 : 0,
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
		return resolve(`player/series/${encodeURIComponent(videoId)}`);
	}

	// Detail page keys on the base content id, not an episode's `video_id`.
	const detailHref = $derived(
		resolve(`detail/${type}/${encodeURIComponent(context.contentId)}`),
	);

	// Intro / outro timestamps (TheIntroDB) — power "Skip intro" and the
	// outro handoff (next-episode card / end-of-show panel).
	const segmentsQuery = $derived(
		playableSrc && contextReady
			? mediaSegments({
					contentId: context.contentId,
					season: context.season,
					episode: context.episode,
				})
			: undefined,
	);
	const segments = $derived(segmentsQuery?.current ?? null);

	// Two end states: "up next" (there is a next episode) and "end of show"
	// (there isn't — shrink the player, show suggestions).
	let upNextVisible = $state(false);
	let upNextCountdown = $state<number | null>(null);
	let countdownTimer: ReturnType<typeof setInterval> | undefined;
	let endOfShow = $state(false);

	const suggestionsQuery = $derived(
		endOfShow
			? similarTitles({
					type: context.metaType,
					id: context.contentId,
					genres: context.genres,
				})
			: undefined,
	);

	const suggestions = $derived(
		(suggestionsQuery?.current?.metas ?? []).slice(0, 12),
	);

	function cancelUpNext() {
		clearInterval(countdownTimer);
		upNextCountdown = null;
		upNextVisible = false;
	}

	function goToNext() {
		const target = context.next;
		cancelUpNext();
		if (target) {
			void goto(playerHref(target.videoId));
		}
	}

	function openUpNext() {
		if (!context.next || upNextVisible) {
			return;
		}
		upNextVisible = true;
		if (theme.current.autoPlayNext) {
			upNextCountdown = 10;
			countdownTimer = setInterval(() => {
				upNextCountdown = (upNextCountdown ?? 1) - 1;
				if (upNextCountdown <= 0) {
					goToNext();
				}
			}, 1000);
		}
	}

	// Fired once when playback reaches the credits, and again on the real `ended`
	// event as a fallback (when there's no outro timestamp).
	function reachedEnd() {
		if (context.next) {
			openUpNext();
		} else {
			endOfShow = true;
		}
	}

	function watchAgain() {
		endOfShow = false;
		cancelUpNext();
		replayNonce += 1;
	}

	$effect(() => {
		void page.params.id;
		endOfShow = false;
		replayNonce = 0;
		return cancelUpNext;
	});

	function goBack() {
		if (history.length > 1) {
			history.back();
		} else {
			void goto(resolve(`detail/${type}/${encodeURIComponent(id)}`));
		}
	}

	// A stream that can't play here (P2P-only, or a codec this browser lacks) but
	// has a direct URL — hand it to an external player (VLC scheme / copy).
	const externalLink = $derived(
		active && (active.notWebReady || codecBlocked)
			? (active.url ?? active.externalUrl)
			: null,
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
		{#if endOfShow}
			<!-- Netflix-style: the player shrinks to a corner while "more like this"
			     takes over the screen. -->
			<div
				class="absolute inset-0 z-20 flex flex-col gap-6 overflow-y-auto bg-linear-to-b from-black via-black/95 to-black p-6 sm:p-10"
			>
				<div class="flex flex-col gap-1">
					<p class="text-xs font-semibold tracking-[0.2em] text-white/50 uppercase">
						You finished
					</p>
					<h2 class="text-2xl font-bold sm:text-3xl">{context.heading}</h2>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<Button size="lg" variant="secondary" onclick={watchAgain}>
						<RotateCcwIcon data-icon="inline-start" /> Watch again
					</Button>
					<Button size="lg" variant="ghost" href={detailHref}>
						<InfoIcon data-icon="inline-start" /> Back to details
					</Button>
				</div>

				{#if suggestions.length > 0}
					<div class="flex flex-col gap-3">
						<p class="text-sm font-semibold text-white/70">More like this</p>
						<div
							class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
						>
							{#each suggestions as meta (meta.id)}
								<a
									href={resolve(`detail/${meta.type}/${encodeURIComponent(meta.id)}`)}
									class="group/sug"
								>
									<div
										class="aspect-2/3 overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/10 transition group-hover/sug:ring-primary/60"
									>
										{#if meta.poster}
											<img
												src={meta.poster}
												alt={meta.name}
												loading="lazy"
												class="size-full object-cover"
											/>
										{/if}
									</div>
									<p class="mt-1.5 line-clamp-2 text-xs text-white/80">
										{meta.name}
									</p>
								</a>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		{#key `${playableSrc}:${replayNonce}`}
			<VideoPlayer
				src={playableSrc}
				fill
				poster={context.background ?? context.poster}
				posterImage={context.poster}
				info={context.info}
				detailHref={detailHref}
				logo={context.logo}
				title={context.heading}
				subheading={active?.label ?? context.subheading}
				startTime={startTime}
				subtitles={subtitlesQuery?.current ?? []}
				certification={context.certification}
				genres={context.genres}
				subtitleSize={theme.current.subtitleSize}
				subtitleColor={theme.current.subtitleColor}
				subtitleBackground={theme.current.subtitleBackground}
				preferredLanguage={theme.current.subtitleLanguage}
				audioRisky={audioRisky}
				videoRisky={videoCodec !== null}
				externalUrl={active?.url ?? active?.externalUrl ?? null}
				introStart={segments?.intro?.start ?? null}
				introEnd={segments?.intro?.end ?? null}
				outroStart={segments?.credits?.start ?? null}
				minimized={endOfShow}
				onProgress={report}
				onEnded={reachedEnd}
				onOutro={reachedEnd}
				onBack={() => history.back()}
				onSources={openSources}
				onSubtitleAppearance={saveSubtitleAppearance}
				onEpisodes={hasEpisodes ? () => episodesOpen = true : undefined}
				onNext={nextVideoId ? () => playVideo(nextVideoId) : undefined}
			/>
		{/key}

		{#if upNextVisible && context.next}
			{@const upNext = context.next}
			<div
				class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center backdrop-blur-sm"
			>
				<p class="text-xs font-semibold tracking-[0.2em] text-white/60 uppercase">
					Up next
				</p>
				{#if upNext.thumbnail}
					<img
						src={upNext.thumbnail}
						alt=""
						class="aspect-video w-56 rounded-lg object-cover ring-1 ring-white/15"
					/>
				{/if}
				<p class="max-w-md text-sm font-medium">{upNext.label}</p>
				<div class="flex items-center gap-2">
					<Button size="lg" onclick={goToNext}>
						<PlayIcon data-icon="inline-start" class="fill-current" />
						{upNextCountdown != null && upNextCountdown > 0
							? `Play now (${upNextCountdown})`
							: "Play next episode"}
					</Button>
					<Button size="lg" variant="secondary" onclick={cancelUpNext}>
						Not now
					</Button>
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
		<div class="relative z-10 flex max-w-md flex-col items-center gap-4 px-6 text-center">
			<p class="text-lg font-semibold">
				{#if !active}
					No playable stream
				{:else if codecBlocked}
					This browser can't decode this source's video
				{:else}
					This source can't play in the browser
				{/if}
			</p>
			<p class="text-sm text-white/60">
				{#if active && codecBlocked}
					Its {videoCodec} video isn't supported here. Open it in an external
					player, or pick a different source.
				{:else if active}
					Pick a different source, or open it in an external player.
				{:else if officialCta}
					{context.heading} is available to watch officially.
				{:else}
					None of your addons returned a stream that plays here.
				{/if}
			</p>
			<div class="flex flex-wrap items-center justify-center gap-2">
				{#if officialCta}
					<Button href={officialCta.url} target="_blank" rel="noopener noreferrer">
						<PlayIcon data-icon="inline-start" class="fill-current" />
						Watch on {officialCta.provider}
					</Button>
				{/if}
				<Button variant={officialCta ? "secondary" : "default"} onclick={openSources}>
					Choose a source
				</Button>
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

			{#if providers.stream.length > 1 || providers.rent.length > 0 || providers.buy.length > 0}
				<div class="dark mt-2 w-full text-left"><WatchProvidersList providers={providers} heading={null} /></div>
			{/if}
		</div>
	{/if}

	{#if episodesOpen && hasEpisodes}
		<PlayerEpisodesPanel
			episodes={context.episodes}
			currentVideoId={context.videoId}
			progress={episodeProgress}
			onClose={() => episodesOpen = false}
			onSelect={playVideo}
		/>
	{/if}
</div>
