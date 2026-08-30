<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlayIcon from "@lucide/svelte/icons/play";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SparklesIcon from "@lucide/svelte/icons/sparkles";
	import { cubicOut } from "svelte/easing";
	import { fly } from "svelte/transition";
	import { toast } from "svelte-sonner";
	import { browser } from "$app/env";
	import { homeRows } from "$lib/addons/addons.remote";
	import type { MetaPreview } from "$lib/addons/index.js";
	import MediaHero from "$lib/components/media-hero.svelte";
	import MediaRow from "$lib/components/media-row.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { sync } from "$lib/sync/store.svelte.js";
	import { cn } from "$lib/utils.js";
	import { formatRemaining } from "$lib/watch/runtime.js";

	let { data } = $props();

	// `data.*` can be briefly undefined during a `forkPreloads` speculative
	// render — read every field defensively.
	const profileName = $derived(data.profile?.name ?? "");

	type ResumeItem = NonNullable<typeof data.resume>[number];

	// Continue-watching = a union of the SSR `continueWatching` payload (full
	// meta) and the local progress store. The store makes the row resilient to a
	// slow / empty SSR pull and reflects a just-watched episode immediately;
	// local-only titles get their poster + name from the library mirror, else a
	// minimal card (the fallback art covers a missing poster).
	const resume = $derived.by<ResumeItem[]>(() => {
		const ssr = (data.resume ?? []) as ResumeItem[];
		if (!sync.authoritative) {
			return ssr;
		}

		// Newest in-progress local row per title.
		const localByContent = new Map<
			string,
			{
				position: number;
				duration: number;
				lastWatched: number;
				videoId: string;
				season: number | null;
				episode: number | null;
				contentType: "movie" | "series";
			}
		>();
		for (const row of sync.progress) {
			if (row.duration <= 60_000 || row.position >= row.duration * 0.9) {
				continue;
			}
			const existing = localByContent.get(row.contentId);
			if (!existing || row.lastWatched > existing.lastWatched) {
				localByContent.set(row.contentId, {
					position: row.position,
					duration: row.duration,
					lastWatched: row.lastWatched,
					videoId: row.videoId,
					season: row.season,
					episode: row.episode,
					contentType: row.contentType,
				});
			}
		}

		const byId = new Map<string, ResumeItem>();

		for (const item of ssr) {
			const local = localByContent.get(item.id);
			byId.set(item.id, {
				...item,
				...(local
					? {
							videoId: local.videoId,
							season: local.season,
							episode: local.episode,
							progress: local.position / local.duration,
							remainingMs: Math.max(0, local.duration - local.position),
						}
					: {}),
			});
		}

		// Local-only in-progress titles the SSR pull missed.
		for (const [contentId, local] of localByContent) {
			if (byId.has(contentId)) {
				continue;
			}
			const libEntry = sync.library.find(
				(entry) => entry.contentId === contentId,
			);
			byId.set(contentId, {
				id: contentId,
				type: local.contentType,
				name: libEntry?.name ?? contentId,
				poster: libEntry?.poster ?? null,
				background: libEntry?.background ?? libEntry?.poster ?? null,
				logo: null,
				videoId: local.videoId,
				season: local.season,
				episode: local.episode,
				progress: local.position / local.duration,
				remainingMs: Math.max(0, local.duration - local.position),
			} as ResumeItem);
		}

		// Insertion order: SSR items (already `last_watched DESC`) then local-only.
		return [...byId.values()]
			.filter((item) => item.progress < 0.9)
			.slice(0, 20);
	});

	// The "My library" row reads the local store once it's authoritative so an
	// add/remove (incl. a right-click action on any poster) reflects instantly —
	// unless the store is authoritative-but-empty over a non-empty SSR payload.
	const library = $derived(
		sync.authoritative &&
			(sync.library.length > 0 || (data.library ?? []).length === 0)
			? sync.library.map((record) => ({
					id: record.contentId,
					type: record.contentType,
					name: record.name,
					poster: record.poster ?? undefined,
					releaseInfo: record.releaseInfo ?? undefined,
					imdbRating: record.imdbRating ?? undefined,
				}))
			: (data.library ?? []),
	);

	// Catalog rows load client-side so a slow addon never stalls SSR / nav.
	const rowsQuery = homeRows();
	const rows = $derived(rowsQuery.current ?? []);
	const rowsLoading = $derived(
		rowsQuery.current === undefined && !rowsQuery.error,
	);

	// Spotlight carousel: derived from the rows once, on first arrival, so the
	// shuffle stays stable across re-renders.
	let spotlights = $state<MetaPreview[]>([]);
	$effect(() => {
		if (spotlights.length > 0 || rows.length === 0) {
			return;
		}
		const seen = new Set<string>();
		const candidates = rows
			.slice(0, 4)
			.flatMap((row) => row.metas)
			.filter((meta) => {
				if (!meta.background || seen.has(meta.id)) {
					return false;
				}
				seen.add(meta.id);
				return true;
			});
		for (let i = candidates.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
		}
		spotlights = candidates.slice(0, 6);
	});

	// Auto-advancing featured carousel. `heroDir` drives the slide direction of
	// the transition (1 = new slide enters from the right, -1 = from the left).
	let heroIndex = $state(0);
	let heroDir = $state<1 | -1>(1);
	let heroPaused = $state(false);
	const HERO_SLIDE = 60;

	function goToHero(index: number) {
		const count = spotlights.length;
		if (count === 0) {
			return;
		}
		heroDir = index === heroIndex ? heroDir : index > heroIndex ? 1 : -1;
		heroIndex = ((index % count) + count) % count;
	}

	$effect(() => {
		if (heroIndex >= spotlights.length) {
			heroIndex = 0;
		}
	});

	$effect(() => {
		const count = spotlights.length;
		if (!browser || count < 2 || heroPaused) {
			return;
		}
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			return;
		}
		const timer = setInterval(() => {
			heroDir = 1;
			heroIndex = (heroIndex + 1) % count;
		}, 8000);
		return () => clearInterval(timer);
	});

	function stepHero(direction: 1 | -1) {
		heroDir = direction;
		const count = spotlights.length;
		heroIndex = (heroIndex + direction + count) % count;
	}

	const spotlight = $derived(spotlights[heroIndex] ?? null);
	const spotlightHref = $derived(
		spotlight
			? `/detail/${spotlight.type}/${encodeURIComponent(spotlight.id)}`
			: "",
	);
	const spotlightRating = $derived(
		spotlight
			? typeof spotlight.imdbRating === "number"
				? spotlight.imdbRating.toFixed(1)
				: spotlight.imdbRating || null
			: null,
	);
	const spotlightType = $derived(
		spotlight?.type === "series" ? "series" : "movie",
	);
	const spotlightInLibrary = $derived(
		Boolean(
			spotlight &&
				sync.authoritative &&
				sync.isInLibrary(spotlightType, spotlight.id),
		),
	);

	function toggleSpotlightLibrary() {
		if (!spotlight) {
			return;
		}
		const removing = spotlightInLibrary;
		sync.toggleLibrary({
			contentId: spotlight.id,
			contentType: spotlightType,
			remove: removing,
			name: spotlight.name,
			poster: spotlight.poster ?? null,
			background: spotlight.background ?? null,
			description: spotlight.description ?? null,
			releaseInfo: spotlight.releaseInfo ?? null,
			imdbRating:
				typeof spotlight.imdbRating === "number"
					? spotlight.imdbRating
					: Number(spotlight.imdbRating) || null,
			genres: spotlight.genres,
		});
		toast.success(
			removing
				? `Removed ${spotlight.name} from library`
				: `Added ${spotlight.name} to library`,
		);
	}

	// Cinemeta exposes the same catalog id ("top" → "Popular") for both movie and
	// series, so titles collide. Suffix the repeats with their type.
	const rowTitles = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const row of rows) {
			counts.set(row.title, (counts.get(row.title) ?? 0) + 1);
		}
		return rows.map((row) => {
			if ((counts.get(row.title) ?? 0) > 1) {
				const noun = row.type === "series" ? "series" : "movies";
				return `${row.title} ${noun}`;
			}
			return row.title;
		});
	});
</script>

<div class="flex flex-col gap-12">
	{#if spotlight}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			role="group"
			aria-roledescription="carousel"
			aria-label="Featured titles"
			onmouseenter={() => (heroPaused = true)}
			onmouseleave={() => (heroPaused = false)}
			onfocusin={() => (heroPaused = true)}
			onfocusout={() => (heroPaused = false)}
			class="grid *:col-start-1 *:row-start-1"
		>
			{#key spotlight.id}
				<div
					in:fly={{
						x: heroDir * HERO_SLIDE,
						duration: 480,
						easing: cubicOut,
					}}
					out:fly={{
						x: heroDir * -HERO_SLIDE,
						duration: 360,
						easing: cubicOut,
					}}
				>
				<MediaHero
					title={spotlight.name}
					logo={spotlight.logo}
					background={spotlight.background}
					poster={spotlight.poster}
					eyebrow="Featured"
					description={spotlight.description}
					rating={spotlightRating}
					year={spotlight.releaseInfo}
					genres={spotlight.genres ?? []}
				>
					{#snippet actions()}
						<Button size="lg" href={spotlightHref}>
							<PlayIcon data-icon="inline-start" class="fill-current" /> Watch now
						</Button>
						<Button
							size="lg"
							variant="secondary"
							onclick={toggleSpotlightLibrary}
						>
							{#if spotlightInLibrary}
								<CheckIcon data-icon="inline-start" /> In library
							{:else}
								<PlusIcon data-icon="inline-start" /> Add to library
							{/if}
						</Button>
						<Button size="lg" variant="ghost" href={spotlightHref}>
							<InfoIcon data-icon="inline-start" /> More info
						</Button>
					{/snippet}

					{#snippet overlay()}
						{#if spotlights.length > 1}
							<div class="absolute right-6 bottom-6 flex items-center gap-3">
								<div class="flex gap-1.5">
									{#each spotlights as item, index (item.id)}
										<button
											type="button"
											aria-label={`Show ${item.name}`}
											aria-current={index === heroIndex ? "true" : undefined}
											onclick={() => goToHero(index)}
											class={cn(
												"h-1.5 rounded-full transition-all",
												index === heroIndex
													? "w-6 bg-primary"
													: "w-1.5 bg-foreground/30 hover:bg-foreground/50",
											)}
										></button>
									{/each}
								</div>
								<div class="hidden gap-1 sm:flex">
									<button
										type="button"
										aria-label="Previous featured title"
										onclick={() => stepHero(-1)}
										class="flex size-8 items-center justify-center rounded-full bg-background/60 ring-1 ring-border backdrop-blur-md transition hover:bg-background"
									>
										<ChevronLeftIcon class="size-4" />
									</button>
									<button
										type="button"
										aria-label="Next featured title"
										onclick={() => stepHero(1)}
										class="flex size-8 items-center justify-center rounded-full bg-background/60 ring-1 ring-border backdrop-blur-md transition hover:bg-background"
									>
										<ChevronRightIcon class="size-4" />
									</button>
								</div>
							</div>
						{/if}
					{/snippet}
				</MediaHero>
				</div>
			{/key}
		</div>
	{:else if rowsLoading || (rows.length > 0 && spotlights.length === 0)}
		<!-- Same box as `media-hero.svelte` so the row below doesn't jump when
		     the real hero paints. -->
		<section
			class="relative isolate mx-[calc(50%-50vw)] -mt-20 mb-2 overflow-hidden"
			aria-hidden="true"
		>
			<div class="absolute inset-0 -z-10 bg-linear-to-br from-muted/60 to-background"></div>
			<div class="mx-auto flex items-end gap-8 px-6 pt-32 pb-12 lg:min-h-[72vh] lg:pb-14">
				<div class="hidden w-52 shrink-0 lg:block">
					<div class="skeleton aspect-2/3 w-full rounded-2xl"></div>
				</div>
				<div class="flex w-full max-w-2xl flex-col gap-4">
					<div class="skeleton h-4 w-24 rounded"></div>
					<div class="skeleton h-12 w-2/3 rounded-lg lg:h-16"></div>
					<div class="skeleton h-4 w-40 rounded"></div>
					<div class="skeleton h-16 w-full max-w-xl rounded-lg"></div>
					<div class="mt-2 flex gap-3">
						<div class="skeleton h-11 w-32 rounded-md"></div>
						<div class="skeleton h-11 w-36 rounded-md"></div>
					</div>
				</div>
			</div>
		</section>
	{:else}
		<h1 class="text-3xl font-bold tracking-tight">Welcome back, {profileName}</h1>
	{/if}

	{#if resume.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-xl font-semibold tracking-tight">Continue watching</h2>
			<div class="no-scrollbar -mx-2 flex gap-4 overflow-x-auto scroll-smooth px-2 pt-1 pb-2">
				{#each resume as item (`${item.type}:${item.videoId}`)}
					<a
						href={`/player/${item.type}/${encodeURIComponent(item.videoId)}`}
						class="group/cw relative aspect-video w-72 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-white/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-16px] hover:shadow-black/70 hover:ring-primary/60"
					>
						<div class="absolute inset-0 bg-linear-to-br from-muted via-muted to-background"></div>
						{#if item.background}
							<img
								src={item.background}
								alt={item.name}
								loading="lazy"
								decoding="async"
								class="relative size-full object-cover transition-transform duration-500 group-hover/cw:scale-105"
							/>
						{/if}
						<div class="absolute inset-0 bg-linear-to-t from-black/85 via-black/25 to-transparent"></div>
						<span
							class="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white opacity-0 ring-1 ring-white/25 backdrop-blur-md transition-opacity duration-300 group-hover/cw:opacity-100"
						>
							<PlayIcon class="size-5 translate-x-px fill-white" />
						</span>
						<div class="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-white">{item.name}</p>
								<p class="text-xs text-white/70">
									{#if item.season != null && item.episode != null}
										S{item.season} · E{item.episode} ·
									{/if}
									{item.progress < 0.01
										? "Not started"
										: formatRemaining(item.remainingMs)}
								</p>
							</div>
							<div class="h-1 overflow-hidden rounded-full bg-white/25">
								<div class="h-full rounded-full bg-primary" style={`width: ${item.progress * 100}%`}></div>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if library.length > 0}
		<MediaRow title="My library" items={library} href="/library" />
	{/if}

	{#if rowsLoading}
		{#each { length: 4 } as _row, index (index)}
			<section class="flex flex-col gap-3">
				<div class="skeleton h-6 w-40 rounded"></div>
				<div class="no-scrollbar -mx-2 flex gap-4 overflow-hidden px-2 py-1">
					{#each { length: 8 } as _tile, tile (tile)}
						<div class="flex w-40 shrink-0 flex-col gap-2.5 sm:w-44">
							<div class="skeleton aspect-2/3 rounded-xl"></div>
							<div class="skeleton h-3.5 w-3/4 rounded"></div>
							<div class="skeleton h-3 w-2/5 rounded"></div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	{:else if rows.length === 0}
		<div class="py-6">
			<div class="mx-auto max-w-md rounded-2xl border border-border/60 bg-linear-to-b from-muted/40 to-transparent px-6 py-14 text-center">
				<span class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border">
					<SparklesIcon class="size-7" />
				</span>
				<p class="mt-4 text-lg font-semibold tracking-tight">Your home feed is empty</p>
				<p class="mt-1 text-sm text-muted-foreground">
					Add a catalog addon and rows of movies and series fill in here.
				</p>
				<Button href="/addons" variant="outline" class="mt-4">Manage addons</Button>
			</div>
		</div>
	{:else}
		{#each rows as row, index (`${row.addonId}:${row.type}:${row.id}`)}
			<MediaRow
				title={rowTitles[index]}
				items={row.metas}
				href={`/discover?c=${encodeURIComponent(`${row.addonId}|${row.type}|${row.id}`)}`}
			/>
		{/each}
	{/if}
</div>
