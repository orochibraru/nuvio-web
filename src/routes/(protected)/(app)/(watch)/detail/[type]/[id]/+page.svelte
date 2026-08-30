<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import CheckIcon from "@lucide/svelte/icons/check";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import FilmIcon from "@lucide/svelte/icons/film";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlayCircleIcon from "@lucide/svelte/icons/play-circle";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { page } from "$app/state";
	import { getMeta, similarTitles } from "$lib/addons/addons.remote";
	import EpisodeAccordion from "$lib/components/episode-accordion.svelte";
	import MediaHero from "$lib/components/media-hero.svelte";
	import MediaRow from "$lib/components/media-row.svelte";
	import TrailerModal from "$lib/components/trailer-modal.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { libraryIds } from "$lib/library/library.remote";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { sync } from "$lib/sync/store.svelte.js";
	import { cn } from "$lib/utils.js";
	import { parseRuntimeMs } from "$lib/watch/runtime.js";
	import { sourcesPanel } from "$lib/watch/sources-panel.svelte.js";
	import { titleProgress } from "$lib/watch/watch.remote";

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

	function watch(videoId: string) {
		openSources(videoId);
	}

	const runtimeMs = $derived(parseRuntimeMs(meta?.runtime));

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

	function toggle() {
		if (!meta) {
			return;
		}
		sync.toggleLibrary({
			contentId: id,
			contentType,
			remove: inLibrary,
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
				<Button href="/addons" variant="outline" class="mt-4">Manage addons</Button>
			</div>
		</div>
	{:else if !meta}
		<div class="mx-[calc(50%-50vw)] -mt-20 min-h-[70vh] px-6 pt-44">
			<div class="mx-auto flex max-w-(--breakpoint-2xl) items-end gap-8">
				<div class="skeleton hidden aspect-2/3 w-52 shrink-0 rounded-2xl lg:block"></div>
				<div class="flex w-full max-w-2xl flex-col gap-4">
					<div class="skeleton h-12 w-2/3 rounded-lg"></div>
					<div class="skeleton h-4 w-1/3 rounded"></div>
					<div class="skeleton h-20 w-full rounded-lg"></div>
					<div class="skeleton h-10 w-64 rounded-lg"></div>
				</div>
			</div>
		</div>
	{:else}
		<MediaHero
			title={meta.name}
			logo={meta.logo}
			background={meta.background}
			poster={meta.poster}
			showPoster
			description={meta.description}
			{rating}
			year={meta.releaseInfo}
			runtime={meta.runtime}
			genres={meta.genres ?? []}
		>
			{#snippet actions()}
				{#if contentType === "movie"}
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

			{#if meta.cast?.length}
				<div class="flex flex-col gap-3">
					<h2 class="text-xl font-semibold tracking-tight">Cast</h2>
					<div class="flex flex-wrap gap-2">
						{#each meta.cast.slice(0, 18) as person (person)}
							<span class="rounded-full bg-foreground/5 px-3 py-1.5 text-sm text-foreground/90">
								{person}
							</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if meta.director?.length || meta.writer?.length || meta.country || meta.awards || meta.released}
				<div class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
					{#if meta.director?.length}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Director</p>
							<p class="mt-1 text-foreground/90">{meta.director.join(", ")}</p>
						</div>
					{/if}
					{#if meta.writer?.length}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Writer</p>
							<p class="mt-1 text-foreground/90">{meta.writer.slice(0, 3).join(", ")}</p>
						</div>
					{/if}
					{#if meta.country}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Country</p>
							<p class="mt-1 text-foreground/90">{meta.country}</p>
						</div>
					{/if}
					{#if meta.released}
						<div>
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Released</p>
							<p class="mt-1 text-foreground/90">
								{new Date(meta.released).toLocaleDateString(undefined, {
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
							</p>
						</div>
					{/if}
					{#if meta.awards}
						<div class="sm:col-span-2 lg:col-span-4">
							<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Awards</p>
							<p class="mt-1 text-foreground/90">{meta.awards}</p>
						</div>
					{/if}
				</div>
			{/if}

			{#if contentType === "series" && seasons.length > 0}
				<div class="flex flex-col gap-4">
					<h2 class="text-xl font-semibold tracking-tight">Episodes</h2>
					<EpisodeAccordion
						videos={meta.videos ?? []}
						seriesRuntime={meta.runtime ?? null}
						{progress}
						initialSeason={resumeEpisode
							? (meta.videos?.find((v) => v.id === resumeEpisode.id)?.season ??
								null)
							: null}
						onPlay={watch}
						onToggleWatched={toggleWatched}
					/>
				</div>
			{/if}

			{#if contentType === "movie" && !meta.description}
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
