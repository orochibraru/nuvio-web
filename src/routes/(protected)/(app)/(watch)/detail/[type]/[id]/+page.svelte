<script lang="ts">
	import {
		BookmarkCheckIcon,
		BookmarkIcon,
		BookmarkOffIcon,
		EyeDashedIcon,
	} from "@lucide/svelte";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import FilmIcon from "@lucide/svelte/icons/film";
	import ListVideoIcon from "@lucide/svelte/icons/list-video";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlayCircleIcon from "@lucide/svelte/icons/play-circle";
	import { toast } from "svelte-sonner";
	import ScrollRail from "#lib/components/layout/scroll-rail.svelte";
	import CastRow from "#lib/components/media/cast-row.svelte";
	import MediaHero from "#lib/components/media/hero.svelte";
	import MediaRow from "#lib/components/media/row.svelte";
	import SeasonCarousel from "#lib/components/media/season-carousel.svelte";
	import TrailerModal from "#lib/components/media/trailer-modal.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { libraryIds } from "#lib/library/library.remote.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { cn } from "#lib/utils.js";
	import { airDateLabel, episodeLabel } from "#lib/watch/episodes.js";
	import {
		parseVideoId,
		playOrder,
		resumeTarget,
		titleProgressFor,
	} from "#lib/watch/playback-context.js";
	import { parseRuntimeMs } from "#lib/watch/runtime.js";
	import { sourcesPanel } from "#lib/watch/sources-panel.svelte.js";
	import { resolveStreams } from "#lib/watch/watch.remote.js";
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
	const contentType = $derived(type === "series" ? "series" : "movie");

	// The source drawer itself lives in the (watch) layout, driven by module state.
	function openSources(videoId: string) {
		sourcesPanel.open(type, videoId);
	}

	// Meta + "more like this" are resolved by the load from the route params and
	// streamed down with the page, so the addon fetch starts server-side rather
	// than after hydration and a second round trip. `null` once ready means no
	// installed addon had this title.
	const metaStream = streamed(
		() => data.meta,
		null as Awaited<typeof data.meta>,
	);
	const metaFailed = $derived(metaStream.ready && metaStream.current === null);
	// The sentence is one message so translators can reorder it; the markers
	// are swapped back for the `<code>` spans in the template.
	const noMetadataParts = m
		.watch_detail_no_metadata_body({ type: "@@type@@", id: "@@id@@" })
		.split(/(@@type@@|@@id@@)/);
	const libraryQuery = libraryIds();
	const meta = $derived(metaStream.current?.meta);
	const progressStream = streamed(() => data.progress, {});
	const progress = $derived(
		sync.authoritative
			? titleProgressFor(sync.progress, type, id, meta?.videos)
			: progressStream.current,
	);

	// A non-reactive-in-template mirror of `meta`: only ever set to a real object,
	// cleared only when the query has no result. A `forkPreloads` speculative
	// render can invalidate `meta` mid-branch, and reading `stableMeta.X` from
	// the template must never see a half-torn-down value.
	let stableMeta = $state<typeof meta>(undefined);
	$effect(() => {
		if (meta) {
			stableMeta = meta;
		} else if (metaStream.ready) {
			stableMeta = undefined;
		}
	});

	$effect(() => {
		pageTitle.set(meta?.name);
	});

	const inLibrary = $derived(
		sync.authoritative
			? sync.isInLibrary(contentType, id)
			: (libraryQuery.current ?? []).includes(id),
	);

	const trailers = $derived(meta?.trailerStreams ?? []);
	let trailerId = $state<string | null>(null);
	// The hero's synopsis is `line-clamp-3` with no way to read the rest on
	// mobile (no hover, no room) : this drives a "More"/"Less" disclosure below
	// the hero on small screens.
	let synopsisExpanded = $state(false);

	const similarStream = streamed(() => data.similar, { metas: [] });
	const nextToAirStream = streamed(() => data.nextToAir, null);
	const nextToAirNotice = $derived(
		nextToAirStream.current
			? `${airDateLabel(nextToAirStream.current.airsAt, undefined, getLocale())} : ${episodeLabel(nextToAirStream.current)}`
			: null,
	);
	const similar = $derived(similarStream.current.metas);

	const rating = $derived(
		typeof meta?.imdbRating === "number"
			? meta.imdbRating.toFixed(1)
			: meta?.imdbRating || null,
	);

	const seasons = $derived.by(() => {
		const set = new Set<number>();
		for (const video of meta?.videos ?? []) {
			if (video.season != null && video.season > 0) {
				set.add(video.season);
			}
		}
		return [...set].sort((a, b) => a - b);
	});

	const orderedEpisodes = $derived(playOrder(meta?.videos));
	const firstEpisode = $derived(orderedEpisodes[0] ?? null);

	const watchedEpisodes = $derived(
		orderedEpisodes.filter((episode) => progress[episode.id]?.completed).length,
	);
	const seriesFlag = $derived.by(() => {
		if (contentType !== "series" || orderedEpisodes.length === 0) {
			return null;
		}
		if (watchedEpisodes === 0) {
			return null;
		}
		if (watchedEpisodes >= orderedEpisodes.length) {
			return m.watch_flag_watched();
		}
		return m.watch_flag_progress({
			watched: watchedEpisodes,
			total: orderedEpisodes.length,
		});
	});

	const resumeEpisode = $derived(
		contentType === "series" ? resumeTarget(orderedEpisodes, progress) : null,
	);

	// Primary CTA: jump straight to the player, which auto-resolves the preferred
	// stream (first available, browser-friendly audio) on a cold load.
	function playerHref(videoId: string) {
		return resolve(`player/${type}/${encodeURIComponent(videoId)}`);
	}
	function watch(videoId: string) {
		void goto(playerHref(videoId));
	}

	// Secondary CTA: let the viewer pick the exact source themselves.
	function selectStream(videoId: string) {
		openSources(videoId);
	}

	// Warm the stream fan-out in the background so opening the source drawer :
	// or landing on the player : feels instant. Remote queries are client-cached
	// by args, so the drawer/player reuse this result.
	// One id at a time on purpose: a full episode-by-episode sweep would hammer
	// the addons. `prefetch()` skips already-warmed and in-flight ids.
	const warmed = new Set<string>();
	function prefetch(videoId: string | null | undefined) {
		if (!(browser && videoId) || warmed.has(videoId)) {
			return;
		}
		warmed.add(videoId);
		// `.catch` subscribes the resource, which kicks off the request; the
		// result lands in the shared client cache for the drawer / player.
		void resolveStreams({ type, id: videoId }).catch(() => undefined);
	}

	const ctaVideoId = $derived(
		contentType === "movie"
			? id
			: (resumeEpisode?.id ?? firstEpisode?.id ?? null),
	);

	// Flips once the CTA target's streams have been warmed : gates the reactive
	// read below so we don't fan out to the addons before the debounce.
	let ctaWarmed = $state(false);
	$effect(() => {
		void ctaVideoId;
		ctaWarmed = false;
	});
	$effect(() => {
		if (!(meta && ctaVideoId)) {
			return;
		}
		const target = ctaVideoId;
		const timer = setTimeout(() => {
			prefetch(target);
			ctaWarmed = true;
		}, 700);
		return () => clearTimeout(timer);
	});

	const runtimeMs = $derived(parseRuntimeMs(meta?.runtime));

	// Official "where to watch" (JustWatch). Drives the hero network badge, the
	// "Available on" section, and : when no addon returns a stream : the primary
	// CTA.
	const releaseYear = $derived(
		Number((meta?.releaseInfo ?? "").slice(0, 4)) || null,
	);

	const imdbId = $derived(/^tt\d+$/.test(id) ? id : null);

	const providersQuery = $derived(
		meta
			? watchProviders({
					title: meta.name,
					year: releaseYear,
					imdbId,
					region: theme.current.watchRegion,
				})
			: undefined,
	);
	const providers = $derived(providersQuery?.current ?? EMPTY_PROVIDERS);

	// Does any installed addon return a stream for the CTA target? `null` while
	// the fan-out is still in flight (or not yet warmed).
	const ctaStreamsResult = $derived(
		ctaWarmed && ctaVideoId
			? resolveStreams({ type, id: ctaVideoId })
			: undefined,
	);
	const ctaStreamCount = $derived(
		ctaStreamsResult?.current?.streams.length ?? null,
	);
	// Fall back to the official source only once we know the addons came back empty.
	const useOfficialCta = $derived(
		ctaStreamCount === 0 && providers.stream.length > 0,
	);
	const officialCta = $derived(providers.stream[0] ?? null);
	// While `ctaStreamCount` is still `null` we don't yet know whether the
	// primary CTA is "Watch" (an addon stream) or "Watch on <provider>" (an
	// external hop) : hold the slot as a skeleton instead of showing one and
	// silently swapping it a moment later.
	const ctaPending = $derived(Boolean(ctaVideoId) && ctaStreamCount === null);

	function toggleWatched(
		videoId: string,
		season: number | null,
		episode: number | null,
		watched: boolean,
	) {
		if (watched) {
			// The row may sit under the URL id (marked here) or the id parsed from
			// the episode id (saved by the player) : clear both.
			for (const contentId of new Set([
				id,
				parseVideoId(type, videoId).contentId,
			])) {
				sync.clearProgress({ contentId, season, episode });
			}
		} else {
			sync.markWatched({
				contentId: id,
				contentType,
				videoId,
				season,
				episode,
				durationMs: runtimeMs,
			});
		}
	}

	/** Marks the unwatched ones in one sync write; returns how many that was. */
	function markEpisodes(videos: typeof orderedEpisodes): number {
		const unwatched = videos.filter((v) => !progress[v.id]?.completed);
		sync.markManyWatched(
			unwatched.map((video) => ({
				contentId: id,
				contentType: "series" as const,
				videoId: video.id,
				season: video.season ?? null,
				episode: video.episode ?? null,
				durationMs: runtimeMs,
			})),
		);
		return unwatched.length;
	}

	function markedToast(added: number, none: string) {
		toast.success(added > 0 ? m.watch_marked_episodes({ count: added }) : none);
	}

	function markUpTo(videoId: string) {
		const index = orderedEpisodes.findIndex((v) => v.id === videoId);
		if (index < 0) {
			return;
		}
		markedToast(
			markEpisodes(orderedEpisodes.slice(0, index + 1)),
			m.watch_episodes_already_watched(),
		);
	}

	function markSeason(season: number, includeEarlier: boolean) {
		const targets = orderedEpisodes.filter((v) => {
			const s = v.season ?? 0;
			return includeEarlier ? s <= season : s === season;
		});
		markedToast(markEpisodes(targets), m.watch_already_watched());
	}

	function markAllWatched() {
		markedToast(markEpisodes(orderedEpisodes), m.watch_already_watched());
	}

	function toggle() {
		if (!meta) {
			return;
		}
		const removing = inLibrary;
		sync.toggleLibrary({
			contentId: id,
			contentType,
			remove: removing,
			name: meta.name,
			poster: meta.poster ?? null,
			background: meta.background ?? null,
			description: meta.description ?? null,
			releaseInfo: meta.releaseInfo ?? null,
			imdbRating:
				typeof meta.imdbRating === "number"
					? meta.imdbRating
					: Number(meta.imdbRating) || null,
			genres: meta.genres,
		});
		toast.success(
			removing
				? m.watch_library_removed({ name: meta.name })
				: m.watch_library_added({ name: meta.name }),
		);
	}
</script>

<div class="relative">
    <!-- `dark`: it always sits on the hero, which is dark media in both themes. -->
    <button
        type="button"
        onclick={() => history.back()}
        class="dark absolute top-20 left-0 z-10 flex items-center gap-1.5 rounded-full bg-background/50 px-3 py-1.5 text-sm font-medium text-foreground ring-1 ring-border backdrop-blur-md transition hover:bg-background/80"
    >
        <ArrowLeftIcon class="size-4" /> {m.common_back()}
    </button>

    {#if metaFailed}
        <div class="pt-28">
            <div
                class="mx-auto max-w-md rounded-2xl border border-border/60 bg-linear-to-b from-muted/40 to-transparent px-6 py-14 text-center"
            >
                <p class="text-lg font-semibold tracking-tight">
                    {m.watch_detail_no_metadata()}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                    {#each noMetadataParts as part, i (i)}{#if part === "@@type@@"}<code>{type}</code>{:else if part === "@@id@@"}<code>{id}</code>{:else}{part}{/if}{/each}
                </p>

                <Button href={`${resolve("settings")}?tab=addons`} variant="outline" class="mt-4"
                    >{m.common_manage_addons()}</Button
                >
            </div>
        </div>
    {:else if !stableMeta}
        <!-- Mirrors `MediaHero`'s own box exactly so the real hero doesn't jump
		     the page when it lands. -->
        <div class="mx-[calc(50%-50vw)] -mt-20 min-h-[72vh]" aria-hidden="true">
            <div class="mx-auto flex items-end gap-8 px-6 pt-32 pb-12 lg:pb-14">
                <div class="hidden w-52 shrink-0 lg:block">
                    <div class="skeleton aspect-2/3 w-full rounded-2xl"></div>
                </div>
                <div class="flex w-full max-w-2xl flex-col gap-4">
                    <div class="skeleton h-12 w-2/3 rounded-lg lg:h-16"></div>
                    <div class="skeleton h-4 w-40 rounded"></div>
                    <div class="skeleton h-16 w-full max-w-xl rounded-lg"></div>
                    <div class="mt-2 flex gap-3">
                        <div class="skeleton h-11 w-32 rounded-md"></div>
                        <div class="skeleton h-11 w-36 rounded-md"></div>
                    </div>
                </div>
            </div>
        </div>
    {:else if stableMeta}
        {@const details = stableMeta}
        <MediaHero
            title={details.name}
            logo={details.logo}
            background={details.background}
            poster={details.poster}
            showPoster
            description={details.description}
            {rating}
            year={contentType === "series" && details.status
                ? `${details.releaseInfo ?? ""} · ${details.status}`.replace(/^ · /, "")
                : details.releaseInfo}
            runtime={details.runtime}
            genres={details.genres ?? []}
            network={providers.network}
            notice={nextToAirNotice}
            flag={contentType === "movie"
                ? progress[id]?.completed
                    ? m.watch_flag_watched()
                    : null
                : seriesFlag}
        >
            {#snippet actions()}
                {#if ctaPending}
                    <div
                        class="skeleton h-11 w-32 rounded-md"
                        aria-hidden="true"
                    ></div>
                {:else if useOfficialCta && officialCta}
                    <Button
                        size="lg"
                        href={officialCta.url}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <PlayIcon
                            data-icon="inline-start"
                            class="fill-current"
                        />
                        {m.watch_on_provider({ provider: officialCta.provider })}
                        <ExternalLinkIcon
                            data-icon="inline-end"
                            class="size-3.5 opacity-70"
                        />
                    </Button>
                {:else if contentType === "movie"}
                    <Button size="lg" onclick={() => watch(id)}>
                        <PlayIcon
                            data-icon="inline-start"
                            class="fill-current"
                        />
                        {#if progress[id] && !progress[id].completed && progress[id].fraction > 0.02}
                            {m.common_resume()}
                        {:else}
                            {m.watch_detail_watch()}
                        {/if}
                    </Button>
                {:else if resumeEpisode}
                    <Button size="lg" onclick={() => watch(resumeEpisode.id)}>
                        <PlayIcon
                            data-icon="inline-start"
                            class="fill-current"
                        />
                        {resumeEpisode.label}
                    </Button>
                {:else if firstEpisode}
                    <Button size="lg" onclick={() => watch(firstEpisode.id)}>
                        <PlayIcon
                            data-icon="inline-start"
                            class="fill-current"
                        />
                        {m.watch_detail_play_episode({
                            season: firstEpisode.season ?? 1,
                            episode: firstEpisode.episode ?? 1,
                        })}
                    </Button>
                {/if}
                {#if ctaVideoId}
                    <Button
                        size="lg"
                        variant="outline"
                        class="glass-button"
                        onclick={() => selectStream(ctaVideoId)}
                    >
                        <ListVideoIcon data-icon="inline-start" />
                        {m.watch_detail_select_stream()}
                    </Button>
                {/if}
                <Button
                    size="lg"
                    variant="outline"
                    onclick={toggle}
                    class="group glass-button"
                >
                    {#if inLibrary}
                        <BookmarkIcon
                            data-icon="inline-start"
                            class="block group-hover:hidden"
                        />
                        <BookmarkOffIcon
                            class="hidden group-hover:block"
                            data-icon="inline-start"
                        />
                    {:else}
                        <BookmarkIcon
                            class="block group-hover:hidden"
                            data-icon="inline-start"
                        />
                        <BookmarkCheckIcon
                            class="hidden group-hover:block"
                            data-icon="inline-start"
                        />
                    {/if}
                    {inLibrary
                        ? m.library_remove()
                        : m.library_add()}
                </Button>
                {#if contentType === "movie"}
                    <Button
                        size="lg"
                        variant="outline"
                        class="group glass-button"
                        onclick={() =>
                            toggleWatched(
                                id,
                                null,
                                null,
                                Boolean(progress[id]?.completed),
                            )}
                    >
                        {#if progress[id]?.completed}
                            <EyeOffIcon
                                class="hidden group-hover:block"
                                data-icon="inline-start"
                            />
                            <EyeIcon
                                class="block group-hover:hidden"
                                data-icon="inline-start"
                            />
                            {m.watch_detail_mark_not_watched()}
                        {:else}
                            <EyeIcon
                                class="hidden group-hover:block"
                                data-icon="inline-start"
                            />
                            <EyeDashedIcon
                                class="block group-hover:hidden"
                                data-icon="inline-start"
                            />
                            {m.watch_detail_mark_watched()}
                        {/if}
                    </Button>
                {:else if orderedEpisodes.length > 0}
                    <Button
                        size="lg"
                        variant="outline"
                        class="group glass-button"
                        onclick={markAllWatched}
                    >
                        <EyeIcon
                            class="hidden group-hover:block"
                            data-icon="inline-start"
                        />
                        <EyeDashedIcon
                            class="block group-hover:hidden"
                            data-icon="inline-start"
                        />
                        {m.common_mark_all_watched()}
                    </Button>
                {/if}
            {/snippet}
        </MediaHero>

        <div class="flex flex-col gap-10 pt-2">
            {#if details.description}
                <div class="flex flex-col items-start gap-1.5 sm:hidden">
                    <p
                        class={cn(
                            "max-w-prose text-sm leading-relaxed text-foreground/80",
                            !synopsisExpanded && "line-clamp-3",
                        )}
                    >
                        {details.description}
                    </p>
                    <button
                        type="button"
                        class="text-sm font-semibold text-primary"
                        onclick={() => (synopsisExpanded = !synopsisExpanded)}
                    >
                        {synopsisExpanded
                            ? m.watch_detail_less()
                            : m.watch_detail_more()}
                    </button>
                </div>
            {/if}

            {#if providers.stream.length > 0 || providers.rent.length > 0 || providers.buy.length > 0}
                <WatchProvidersList {providers} />
            {/if}

            {#if contentType === "series" && seasons.length > 0}
                <SeasonCarousel
                    videos={details.videos ?? []}
                    seriesRuntime={details.runtime ?? null}
                    {progress}
                    initialSeason={resumeEpisode
                        ? (details.videos?.find((v) => v.id === resumeEpisode.id)
                              ?.season ?? null)
                        : null}
                    {playerHref}
                    onToggleWatched={toggleWatched}
                    onPrefetch={prefetch}
                    onMarkUpTo={markUpTo}
                    onMarkSeason={markSeason}
                />
            {/if}

            {#if trailers.length > 0}
                <div class="flex flex-col gap-3">
                    <h2 class="text-xl font-semibold tracking-tight">
                        {m.watch_detail_trailers()}
                    </h2>
                    <ScrollRail label={m.watch_detail_trailers()} trackClass="gap-4 pb-2">
                        {#each trailers.slice(0, 8) as trailer, i (trailer.ytId)}
                            <button
                                type="button"
                                onclick={() => (trailerId = trailer.ytId)}
                                class="group/tr relative aspect-video w-72 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-white/5 transition-all hover:-translate-y-1 hover:ring-primary/60"
                            >
                                <img
                                    src={`https://i.ytimg.com/vi/${trailer.ytId}/hqdefault.jpg`}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    class="size-full object-cover transition-transform duration-200 group-hover/tr:scale-105"
                                />
                                <div
                                    class="absolute inset-0 bg-black/30 transition-colors group-hover/tr:bg-black/10"
                                ></div>
                                <span
                                    class="absolute inset-0 flex items-center justify-center text-white"
                                >
                                    <PlayCircleIcon
                                        class="size-12 drop-shadow-lg"
                                    />
                                </span>
                                <span
                                    class="absolute bottom-2 left-3 text-xs font-medium text-white drop-shadow"
                                >
                                    {trailer.title ||
                                        m.watch_detail_trailer_n({ number: i + 1 })}
                                </span>
                            </button>
                        {/each}
                    </ScrollRail>
                </div>
            {/if}

            {#if details.cast?.length}
                <div class="flex flex-col gap-3">
                    <h2 class="text-xl font-semibold tracking-tight">
                        {m.common_cast()}
                    </h2>
                    <CastRow names={details.cast.slice(0, 18)} />
                </div>
            {/if}

            {#if details.director?.length || details.writer?.length || details.country || details.awards || details.released}
                <div class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    {#if details.director?.length}
                        <div>
                            <p
                                class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                            >
                                {m.credits_director()}
                            </p>
                            <p class="mt-1 text-foreground/90">
                                {details.director.join(", ")}
                            </p>
                        </div>
                    {/if}
                    {#if details.writer?.length}
                        <div>
                            <p
                                class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                            >
                                {m.credits_writer()}
                            </p>
                            <p class="mt-1 text-foreground/90">
                                {details.writer.slice(0, 3).join(", ")}
                            </p>
                        </div>
                    {/if}
                    {#if details.country}
                        <div>
                            <p
                                class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                            >
                                {m.credits_country()}
                            </p>
                            <p class="mt-1 text-foreground/90">{details.country}</p>
                        </div>
                    {/if}
                    {#if details.released}
                        <div>
                            <p
                                class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                            >
                                {m.watch_detail_released()}
                            </p>
                            <p class="mt-1 text-foreground/90">
                                {new Date(details.released).toLocaleDateString(
                                    getLocale(),
                                    {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                    },
                                )}
                            </p>
                        </div>
                    {/if}
                    {#if details.awards}
                        <div class="sm:col-span-2 lg:col-span-4">
                            <p
                                class="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                            >
                                {m.credits_awards()}
                            </p>
                            <p class="mt-1 text-foreground/90">{details.awards}</p>
                        </div>
                    {/if}
                </div>
            {/if}

            {#if contentType === "movie" && !details.description}
                <div
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                >
                    <FilmIcon class="size-4" /> {m.watch_detail_no_synopsis()}
                </div>
            {/if}

            {#if similar.length > 0}
                <MediaRow title={m.common_more_like_this()} items={similar} />
            {/if}
        </div>
    {/if}
</div>

<TrailerModal
    ytId={trailerId}
    title={meta?.name ?? m.common_trailer()}
    onClose={() => (trailerId = null)}
/>
