<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PlayIcon from "@lucide/svelte/icons/play";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { toast } from "svelte-sonner";
	import { similarTitles } from "#lib/addons/addons.remote.js";
	import PlaybackLoading from "#lib/components/playback-loading.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import VideoPlayer from "#lib/components/video-player/video-player.svelte";
	import { saveUiSettings } from "#lib/settings/settings.remote.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { UiSettings } from "#lib/settings/ui-settings.js";
	import { pageTitle } from "#lib/stores/title.svelte.js";
	import { streamed } from "#lib/stream.svelte.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { browserCanPlayCodec } from "#lib/watch/codec-support.js";
	import { externalPlayerHandoff } from "#lib/watch/external-player.js";
	import {
		forgetLink,
		playbackHandoff,
		recallLink,
		rememberLink,
	} from "#lib/watch/playback.svelte.js";
	import PlayerEndPanel from "#lib/watch/player-end-panel.svelte";
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
		resolveStreams,
		titleProgress,
	} from "#lib/watch/watch.remote.js";
	import { EMPTY_PROVIDERS } from "#lib/watch/watch-providers.js";
	import { watchProviders } from "#lib/watch/watch-providers.remote.js";
	import WatchProvidersList from "#lib/watch/watch-providers-list.svelte";
	import { browser } from "$app/env";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	let { data } = $props();

	const type = $derived(page.params.type ?? "movie");
	const id = $derived(page.params.id ?? "");

	// Meta / resume / next-episode context comes from the load, streamed, so
	// the player shell still paints on navigation but doesn't then pay for a
	// client round trip to find out what it's playing.
	const contextStream = streamed(
		() => data.context,
		null as Awaited<typeof data.context>,
	);
	type PlaybackCtx = NonNullable<Awaited<typeof data.context>>;
	const contextReady = $derived(contextStream.ready);
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
		contextStream.current ?? contextFallback,
	);

	$effect(() => {
		if (contextReady) {
			pageTitle.set(context.heading);
		}
	});

	// The source drawer, shared with /detail through the (watch) layout.
	function openSources() {
		// Reaching for another source means the current link is no good : drop it
		// so "reuse last link" doesn't hand it back next time.
		forgetLink(id);
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

	// The stream picked on /streams; else a remembered link (if "reuse last link"
	// is on and it's still fresh); else resolve one here on a cold load.
	const handed = $derived(
		playbackHandoff.take(id) ??
			(theme.current.reuseLastLink
				? recallLink(id, theme.current.linkCacheDays)
				: null),
	);
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
				infoHash: autoStream.infoHash,
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
	// The stream fan-out rejected (addon host down, CORS, network) : a distinct
	// state from "still loading" so the shell can offer a retry instead of
	// spinning forever.
	const streamsError = $derived(!handed && streamsQuery?.error != null);
	const resolving = $derived(
		!(handed || streamsQuery?.current || streamsError),
	);

	// Official "where to watch" : the fallback when no addon stream plays here.
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
	// audio : used to make the player's no-sound detection more eager.
	const audioRisky = $derived(
		handed
			? handed.audioRisky
			: autoStream
				? audioSupport(autoStream) === "risky"
				: false,
	);

	// Bumped by "Watch again" to remount the player and replay from the start.
	let replayNonce = $state(0);

	// Always pick up where the viewer left off : no "resume vs start over" prompt.
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

	let linkRemembered = false;

	function report(position: number, duration: number) {
		// First progress tick means the stream actually played : remember its URL
		// for "reuse last link".
		if (!linkRemembered && position > 2 && active?.url) {
			linkRemembered = true;
			rememberLink({
				videoId: id,
				url: active.url,
				externalUrl: active.externalUrl ?? null,
				notWebReady: Boolean(active.notWebReady),
				label: active.label ?? context.heading,
				addonName: active.addonName ?? "",
				infoHash: active.infoHash ?? null,
				audioRisky,
				videoRisky: videoCodec !== null,
				videoCodec,
			});
		}
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

	// Intro / outro timestamps (TheIntroDB) : power "Skip intro" and the
	// outro handoff (next-episode card / end-of-show panel).
	const segmentsQuery = $derived(
		playableSrc && contextReady
			? mediaSegments({
					contentId: context.contentId,
					season: context.season,
					episode: context.episode,
					apiKey: theme.current.introDbApiKey,
				})
			: undefined,
	);
	const segments = $derived(segmentsQuery?.current ?? null);

	// Two end states: "up next" (there is a next episode) and "end of show"
	// (there isn't : shrink the player, show suggestions).
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

	// True once the video element actually fired `ended` (vs. just crossing the
	// outro timestamp mid-credits) : gates the "Back to video" affordance.
	let trueEnd = $state(false);

	// Fired once when playback reaches the credits, and again on the real `ended`
	// event as a fallback (when there's no outro timestamp).
	function reachedEnd(ended = false) {
		if (ended) {
			trueEnd = true;
		}
		if (context.next) {
			openUpNext();
		} else {
			endOfShow = true;
		}
	}

	// The end-of-show takeover shouldn't leave the credits blaring under it.
	$effect(() => {
		if (endOfShow) {
			document.querySelector("video")?.pause();
		}
	});

	// Dismiss the takeover and keep watching from where we are (post-credits
	// scene, or just finishing the credits).
	function backToVideo() {
		endOfShow = false;
		cancelUpNext();
		queueMicrotask(() => void document.querySelector("video")?.play());
	}

	function watchAgain() {
		endOfShow = false;
		trueEnd = false;
		cancelUpNext();
		replayNonce += 1;
	}

	$effect(() => {
		void page.params.id;
		endOfShow = false;
		replayNonce = 0;
		trueEnd = false;
		linkRemembered = false;
		return cancelUpNext;
	});

	// Leaving the player always lands on this title's detail page. `history.back()`
	// is a guess : it can bounce to whatever was open before, or out of the app
	// when the player was opened directly : and the old fallback used the *video*
	// id, so an episode (`tt0903747:1:1`) built a detail URL for a title that
	// doesn't exist. `replaceState` so the player doesn't sit in the history for
	// the browser's own back button to return to.
	function goBack() {
		void goto(
			resolve(
				`detail/${context.metaType}/${encodeURIComponent(context.contentId)}`,
			),
			{ replaceState: true },
		);
	}

	// A stream that can't play here (P2P-only, or a codec this browser lacks) but
	// has a direct URL : hand it to an external player, or let the viewer copy
	// it. `playerLink` is null on desktop, where no player registers a URL
	// scheme, so there the copy button is the handoff.
	const externalLink = $derived(
		active && (active.notWebReady || codecBlocked)
			? (active.url ?? active.externalUrl)
			: null,
	);
	// What "play in an external player" can actually do here: a deep link
	// (mobile), a `magnet:` (P2P sources : the OS's torrent app, and the only
	// thing a magnet-only stream *can* hand over), or copying the URL on
	// desktop, where no player registers a scheme. Never nothing while the
	// copy above promises one.
	const handoff = $derived(
		browser && active
			? externalPlayerHandoff(
					{
						url: active.url,
						externalUrl: active.externalUrl,
						infoHash: active.infoHash,
						name: active.label ?? context.heading,
					},
					navigator.userAgent,
				)
			: null,
	);

	async function playExternally() {
		if (handoff?.kind !== "copy") {
			return;
		}
		try {
			await navigator.clipboard.writeText(handoff.url);
			copied = true;
			toast.success("Link copied : paste it into your player");
			setTimeout(() => (copied = false), 2000);
		} catch {
			toast.error("Couldn't copy the link");
		}
	}

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

<div
  class="fixed inset-0 z-40 flex items-center justify-center bg-black text-white"
>
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
      <PlayerEndPanel
        heading={context.heading}
        {detailHref}
        {suggestions}
        onBack={goBack}
        onWatchAgain={watchAgain}
        onResume={trueEnd ? undefined : backToVideo}
      />
    {/if}

    {#key `${playableSrc}:${replayNonce}`}
      <VideoPlayer
        src={playableSrc}
        fill
        poster={context.background ?? context.poster}
        posterImage={context.poster}
        info={context.info}
        {detailHref}
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
        {audioRisky}
        videoRisky={videoCodec !== null}
        externalUrl={active?.url ?? active?.externalUrl ?? null}
        introStart={segments?.intro?.start ?? null}
        introEnd={segments?.intro?.end ?? null}
        outroStart={segments?.credits?.start ?? null}
        minimized={endOfShow}
        onProgress={report}
        onEnded={() => reachedEnd(true)}
        onOutro={() => reachedEnd(false)}
        onBack={goBack}
        onSources={openSources}
        onSubtitleAppearance={saveSubtitleAppearance}
        onEpisodes={hasEpisodes ? () => (episodesOpen = true) : undefined}
        onNext={nextVideoId ? () => playVideo(nextVideoId) : undefined}
      />
    {/key}

    {#if upNextVisible && context.next}
      {@const upNext = context.next}
      <div
        class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-center backdrop-blur-sm"
      >
        <p
          class="text-xs font-semibold tracking-[0.2em] text-white/60 uppercase"
        >
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
      label="Finding a stream"
    />
  {:else if streamsError}
    <div
      class="relative z-10 flex max-w-md flex-col items-center gap-3 px-6 text-center"
    >
      <TriangleAlertIcon class="size-8 text-destructive" />
      <p class="text-lg font-semibold">Couldn't reach your addons</p>
      <p class="text-sm text-white/60">
        Something went wrong finding a stream for this title.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <Button onclick={() => streamsQuery?.refresh()}>
          <RotateCcwIcon data-icon="inline-start" /> Try again
        </Button>
        <Button variant="secondary" onclick={openSources}
          >Choose a source</Button
        >
      </div>
    </div>
  {:else}
    <div
      class="relative z-10 flex max-w-md flex-col items-center gap-4 px-6 text-center"
    >
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
          Its {videoCodec} video isn't supported here. Open it in an external player,
          or pick a different source.
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
          <Button
            href={officialCta.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <PlayIcon data-icon="inline-start" class="fill-current" />
            Watch on {officialCta.provider}
          </Button>
        {/if}
        <Button
          variant={officialCta ? "secondary" : "default"}
          onclick={openSources}
        >
          Choose a source
        </Button>
        {#if handoff?.kind === "link"}
          <Button variant="secondary" href={handoff.href}>
            <ExternalLinkIcon data-icon="inline-start" /> Play in external player
          </Button>
        {:else if handoff?.kind === "copy"}
          <Button variant="secondary" onclick={playExternally}>
            <ExternalLinkIcon data-icon="inline-start" /> Play in external player
          </Button>
        {/if}
        {#if externalLink}
          <Button variant="ghost" onclick={copyStreamLink}>
            <CopyIcon data-icon="inline-start" />
            {copied ? "Copied" : "Copy link"}
          </Button>
        {/if}
      </div>

      {#if providers.stream.length > 1 || providers.rent.length > 0 || providers.buy.length > 0}
        <div class="dark mt-2 w-full text-left">
          <WatchProvidersList {providers} heading={null} />
        </div>
      {/if}
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
