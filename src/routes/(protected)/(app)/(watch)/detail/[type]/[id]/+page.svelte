<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CheckIcon from "@lucide/svelte/icons/check";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import FilmIcon from "@lucide/svelte/icons/film";
	import ListVideoIcon from "@lucide/svelte/icons/list-video";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlayCircleIcon from "@lucide/svelte/icons/play-circle";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";
	import { browser } from "$app/env";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { getMeta, similarTitles } from "$lib/addons/addons.remote";
	import CastRow from "$lib/components/cast-row.svelte";
	import MediaHero from "$lib/components/media-hero.svelte";
	import MediaRow from "$lib/components/media-row.svelte";
	import SeasonCarousel from "$lib/components/season-carousel.svelte";
	import TrailerModal from "$lib/components/trailer-modal.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { libraryIds } from "$lib/library/library.remote";
	import { theme } from "$lib/settings/theme.svelte";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { sync } from "$lib/sync/store.svelte.js";
	import { cn } from "$lib/utils.js";
	import { parseRuntimeMs } from "$lib/watch/runtime.js";
	import { sourcesPanel } from "$lib/watch/sources-panel.svelte.js";
	import {
		playbackContext,
		resolveStreams,
		titleProgress,
	} from "$lib/watch/watch.remote";
	import { EMPTY_PROVIDERS } from "$lib/watch/watch-providers.js";
	import { watchProviders } from "$lib/watch/watch-providers.remote";
	import WatchProvidersList from "$lib/watch/watch-providers-list.svelte";

	const type = $derived(page.params.type ?? "movie");
	const id = $derived(page.params.id ?? "");
	const contentType = $derived(type === "series" ? "series" : "movie");

	// The source drawer itself lives in the (watch) layout, driven by module state.
	function openSources(videoId: string) {
		sourcesPanel.open(type, videoId);
	}

	const metaQuery = $derived(getMeta({ type, id }));
	const libraryQuery = libraryIds();
	const progressQuery = $derived(titleProgress({ contentId: id }));
	const progress = $derived(
		sync.authoritative ? sync.titleProgress(id) : (progressQuery.current ?? {}),
	);

	const meta = $derived(metaQuery.current?.meta);

	// A non-reactive-in-template mirror of `meta`: only ever set to a real object,
	// cleared only when the query has no result. A `forkPreloads` speculative
	// render can invalidate `meta` mid-branch, and reading `stableMeta.X` from
	// the template must never see a half-torn-down value.
	let stableMeta = $state<typeof meta>(undefined);
	$effect(() => {
		if (meta) {
			stableMeta = meta;
		} else if (!metaQuery.current) {
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

	const similarQuery = $derived(
		meta ? similarTitles({ type, id, genres: meta.genres ?? [] }) : undefined,
	);
	const similar = $derived(similarQuery?.current?.metas ?? []);

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

	const orderedEpisodes = $derived(
		[...(meta?.videos ?? [])]
			.filter((video) => (video.season ?? 0) > 0)
			.sort(
				(a, b) =>
					(a.season ?? 0) - (b.season ?? 0) ||
					(a.episode ?? 0) - (b.episode ?? 0),
			),
	);
	const firstEpisodeId = $derived(orderedEpisodes[0]?.id ?? null);

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
			return "Watched";
		}
		return `${watchedEpisodes}/${orderedEpisodes.length} watched`;
	});

	// Series CTA target: an in-progress episode, else the first unwatched one.
	const resumeEpisode = $derived.by(() => {
		if (contentType !== "series" || orderedEpisodes.length === 0) {
			return null;
		}
		const inProgress = orderedEpisodes.find((episode) => {
			const p = progress[episode.id];
			return p && !p.completed && p.fraction > 0.02;
		});
		if (inProgress) {
			return {
				id: inProgress.id,
				label: `Resume S${inProgress.season}E${inProgress.episode}`,
			};
		}
		const nextUp = orderedEpisodes.find(
			(episode) => !progress[episode.id]?.completed,
		);
		if (nextUp && progress[orderedEpisodes[0].id]?.completed) {
			return {
				id: nextUp.id,
				label: `Play S${nextUp.season}E${nextUp.episode}`,
			};
		}
		return null;
	});

	// Primary CTA: jump straight to the player, which auto-resolves the preferred
	// stream (first available, browser-friendly audio) on a cold load.
	function watch(videoId: string) {
		void goto(resolve(`/player/${type}/${encodeURIComponent(videoId)}`));
	}

	// Secondary CTA: let the viewer pick the exact source themselves.
	function selectStream(videoId: string) {
		openSources(videoId);
	}

	// Warm the stream fan-out (and playback context) in the background so opening
	// the source drawer — or landing on the player — feels instant. Remote
	// queries are client-cached by args, so the drawer/player reuse this result.
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
		void playbackContext({ type, id: videoId }).catch(() => undefined);
	}

	const ctaVideoId = $derived(
		contentType === "movie" ? id : (resumeEpisode?.id ?? firstEpisodeId),
	);
	// Flips once the CTA target's streams have been warmed — gates the reactive
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
	// "Available on" section, and — when no addon returns a stream — the primary
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

	function toggleWatched(
		videoId: string,
		season: number | null,
		episode: number | null,
		watched: boolean,
	) {
		if (watched) {
			sync.clearProgress({ contentId: id, season, episode });
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

	function markEpisode(video: (typeof orderedEpisodes)[number]) {
		if (progress[video.id]?.completed) {
			return;
		}
		sync.markWatched({
			contentId: id,
			contentType: "series",
			videoId: video.id,
			season: video.season ?? null,
			episode: video.episode ?? null,
			durationMs: runtimeMs,
		});
	}

	function markUpTo(videoId: string) {
		const index = orderedEpisodes.findIndex((v) => v.id === videoId);
		if (index < 0) {
			return;
		}
		const targets = orderedEpisodes.slice(0, index + 1);
		const added = targets.filter((v) => !progress[v.id]?.completed).length;
		for (const video of targets) {
			markEpisode(video);
		}
		toast.success(
			added > 0
				? `Marked ${added} episode${added === 1 ? "" : "s"} watched`
				: "Those episodes are already watched",
		);
	}

	function markSeason(season: number, includeEarlier: boolean) {
		const targets = orderedEpisodes.filter((v) => {
			const s = v.season ?? 0;
			return includeEarlier ? s <= season : s === season;
		});
		const added = targets.filter((v) => !progress[v.id]?.completed).length;
		for (const video of targets) {
			markEpisode(video);
		}
		toast.success(
			added > 0
				? `Marked ${added} episode${added === 1 ? "" : "s"} watched`
				: "Already watched",
		);
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
				? `Removed ${meta.name} from library`
				: `Added ${meta.name} to library`,
		);
	}
</script>

<div class="relative">
	<button
		type="button"
		onclick={() => history.back()}
		class="absolute top-20 left-0 z-10 flex items-center gap-1.5 rounded-full bg-background/50 px-3 py-1.5 text-sm font-medium text-foreground ring-1 ring-border backdrop-blur-md transition hover:bg-background/80"
	>
		<ArrowLeftIcon class="size-4" /> Back
	</button>

	{#if metaQuery.error}
		<div class="pt-28">
			<div class="mx-auto max-w-md rounded-2xl border border-border/60 bg-linear-to-b from-muted/40 to-transparent px-6 py-14 text-center">
				<p class="text-lg font-semibold tracking-tight">No metadata for this title</p>
				<p class="mt-1 text-sm text-muted-foreground">
					No installed addon provides <code>{type}</code> metadata for
					<code>{id}</code>.
				</p>
				<Button href={resolve("/addons")} variant="outline" class="mt-4">Manage addons</Button>
			</div>
		</div>
	{:else if !stableMeta}
		<div class="mx-[calc(50%-50vw)] -mt-20 min-h-[70vh] px-6 pt-44">
			<div class="mx-auto flex items-end gap-8 mt-80">
				<div class="skeleton hidden aspect-2/3 w-52 shrink-0 rounded-2xl lg:block"></div>
				<div class="flex w-full max-w-2xl flex-col gap-4">
					<div class="skeleton h-12 w-2/3 rounded-lg"></div>
					<div class="skeleton h-4 w-1/3 rounded"></div>
					<div class="skeleton h-20 w-full rounded-lg"></div>
					<div class="skeleton h-10 w-64 rounded-lg"></div>
				</div>
			</div>
		</div>
	{:else if stableMeta}
		{@const m = stableMeta}
		<MediaHero
			title={m.name}
			logo={m.logo}
			background={m.background}
			poster={m.poster}
			showPoster
			description={m.description}
			{rating}
			year={contentType === "series" && m.status
				? `${m.releaseInfo ?? ""} · ${m.status}`.replace(/^ · /, "")
				: m.releaseInfo}
			runtime={m.runtime}
			genres={m.genres ?? []}
			network={providers.network}
			flag={contentType === "movie"
				? progress[id]?.completed
					? "Watched"
					: null
				: seriesFlag}
		>
			{#snippet actions()}
				{#if useOfficialCta && officialCta}
					<Button
						size="lg"
						href={officialCta.url}
						target="_blank"
						rel="noopener noreferrer"
					>
						<PlayIcon data-icon="inline-start" class="fill-current" />
						Watch on {officialCta.provider}
					</Button>
				{:else if contentType === "movie"}
					<Button size="lg" onclick={() => watch(id)}>
						<PlayIcon data-icon="inline-start" class="fill-current" />
						{#if progress[id] && !progress[id].completed && progress[id].fraction > 0.02}
							Resume
						{:else}
							Watch
						{/if}
					</Button>
				{:else if resumeEpisode}
					<Button size="lg" onclick={() => watch(resumeEpisode.id)}>
						<PlayIcon data-icon="inline-start" class="fill-current" />
						{resumeEpisode.label}
					</Button>
				{:else if firstEpisodeId}
					<Button size="lg" onclick={() => watch(firstEpisodeId)}>
						<PlayIcon data-icon="inline-start" class="fill-current" /> Play S1E1
					</Button>
				{/if}
				{#if ctaVideoId}
					<Button
						size="lg"
						variant="outline"
						onclick={() => selectStream(ctaVideoId)}
					>
						<ListVideoIcon data-icon="inline-start" /> Select stream
					</Button>
				{/if}
				<Button size="lg" variant="secondary" onclick={toggle}>
					{#if inLibrary}
						<CheckIcon data-icon="inline-start" />
					{:else}
						<PlusIcon data-icon="inline-start" />
					{/if}
					{inLibrary ? "In library" : "Add to library"}
				</Button>
				{#if contentType === "movie"}
					<Button
						size="lg"
						variant="ghost"
						onclick={() =>
							toggleWatched(id, null, null, Boolean(progress[id]?.completed))}
					>
						{#if progress[id]?.completed}
							<EyeOffIcon data-icon="inline-start" /> Watched
						{:else}
							<EyeIcon data-icon="inline-start" /> Mark watched
						{/if}
					</Button>
				{/if}
			{/snippet}
		</MediaHero>

		<div class="flex flex-col gap-10 pt-2">
			{#if providers.stream.length > 0 || providers.rent.length > 0 || providers.buy.length > 0}
				<WatchProvidersList {providers} />
			{/if}

			{#if contentType === "series" && seasons.length > 0}
				<SeasonCarousel
					videos={m.videos ?? []}
					seriesRuntime={m.runtime ?? null}
					{progress}
					initialSeason={resumeEpisode
						? (m.videos?.find((v) => v.id === resumeEpisode.id)?.season ?? null)
						: null}
					onPlay={watch}
					onToggleWatched={toggleWatched}
					onPrefetch={prefetch}
					onMarkUpTo={markUpTo}
					onMarkSeason={markSeason}
				/>
			{/if}

			{#if trailers.length > 0}
				<div class="flex flex-col gap-3">
					<h2 class="text-xl font-semibold tracking-tight">Trailers</h2>
					<div class="no-scrollbar -mx-2 flex gap-4 overflow-x-auto px-2 pb-2">
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
									class="size-full object-cover transition-transform duration-500 group-hover/tr:scale-105"
								/>
								<div class="absolute inset-0 bg-black/30 transition-colors group-hover/tr:bg-black/10"></div>
								<span class="absolute inset-0 flex items-center justify-center text-white">
									<PlayCircleIcon class="size-12 drop-shadow-lg" />
								</span>
								<span class="absolute bottom-2 left-3 text-xs font-medium text-white drop-shadow">
									{trailer.title || `Trailer ${i + 1}`}
								</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if m.cast?.length}
				<div class="flex flex-col gap-3">
					<h2 class="text-xl font-semibold tracking-tight">Cast</h2>
					<CastRow names={m.cast.slice(0, 18)} />
				</div>
			{/if}

			{#if m.director?.length || m.writer?.length || m.country || m.awards || m.released}
				<div class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
					{#if m.director?.length}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Director</p>
							<p class="mt-1 text-foreground/90">{m.director.join(", ")}</p>
						</div>
					{/if}
					{#if m.writer?.length}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Writer</p>
							<p class="mt-1 text-foreground/90">{m.writer.slice(0, 3).join(", ")}</p>
						</div>
					{/if}
					{#if m.country}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Country</p>
							<p class="mt-1 text-foreground/90">{m.country}</p>
						</div>
					{/if}
					{#if m.released}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Released</p>
							<p class="mt-1 text-foreground/90">
								{new Date(m.released).toLocaleDateString(undefined, {
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
							</p>
						</div>
					{/if}
					{#if m.awards}
						<div class="sm:col-span-2 lg:col-span-4">
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Awards</p>
							<p class="mt-1 text-foreground/90">{m.awards}</p>
						</div>
					{/if}
				</div>
			{/if}

			{#if contentType === "movie" && !m.description}
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<FilmIcon class="size-4" /> No synopsis available for this title.
				</div>
			{/if}

			{#if similar.length > 0}
				<MediaRow title="More like this" items={similar} />
			{/if}
		</div>
	{/if}
</div>

<TrailerModal
	ytId={trailerId}
	title={meta?.name ?? "Trailer"}
	onClose={() => (trailerId = null)}
/>
