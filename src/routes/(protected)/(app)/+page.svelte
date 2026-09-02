<script lang="ts">
  import {
    BookmarkCheckIcon,
    BookmarkIcon,
    BookmarkOffIcon,
  } from "@lucide/svelte";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import InfoIcon from "@lucide/svelte/icons/info";
  import PlayIcon from "@lucide/svelte/icons/play";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import { cubicOut } from "svelte/easing";
  import { fly } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import type { MetaPreview } from "#lib/addons/index.js";
  import AuroraBackground from "#lib/components/aurora-background.svelte";
  import ContinueWatchingCard from "#lib/components/continue-watching-card.svelte";
  import MediaHero from "#lib/components/media-hero.svelte";
  import MediaRow from "#lib/components/media-row.svelte";
  import QueryError from "#lib/components/query-error.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { reduced } from "#lib/motion.js";
  import { streamed } from "#lib/stream.svelte.js";
  import { sync } from "#lib/sync/store.svelte.js";
  import { cn } from "#lib/utils.js";
  import type { ResumeRow } from "#lib/watch/watch-data.js";
  import { browser } from "$app/env";
  import { invalidateAll } from "$app/navigation";
  import { resolve } from "$app/paths";

  let { data } = $props();

  // `data.*` can be briefly undefined during a `forkPreloads` speculative
  // render : read every field defensively.
  const profileName = $derived(data.profile?.name ?? "");

  // `data.library` / `data.resume` stream in from the server load (unawaited
  // promises) so the shell paints instantly. The sync store takes over as the
  // live source the moment it's authoritative, so a brief empty value is fine.
  const libraryStream = streamed(() => data.library, []);
  const resumeStream = streamed(() => data.resume, []);
  const ssrLibrary = $derived(libraryStream.current);
  const ssrResume = $derived(resumeStream.current);

  // Titles the viewer removed from the row this session. `sync.clearProgress`
  // drops the underlying API row, but the SSR / store snapshot still carries it
  // until the next pull : filter those out here.
  let dismissed = $state(new Set<string>());
  function dismiss(id: string) {
    dismissed = new Set(dismissed).add(id);
  }

  // Continue-watching. The load ships rows already joined to addon meta (name
  // / art, with a finished series episode rolled forward to the next one);
  // the local store is the live source once authoritative. Meta falls back to
  // the library mirror, then to the card's own fallback art.
  const enrichedById = $derived(
    new Map(ssrResume.map((item) => [item.id, item])),
  );

  interface ResumeBase {
    id: string;
    type: "movie" | "series";
    videoId: string;
    season: number | null;
    episode: number | null;
    progress: number;
    remainingMs: number;
    lastWatched: number;
  }

  // The in-progress rows before enrichment: the local store when it's
  // authoritative, otherwise the SSR payload (ordered, so `-index` keeps order).
  function baseResumeRows(): Map<string, ResumeBase> {
    const base = new Map<string, ResumeBase>();
    if (sync.authoritative) {
      for (const row of sync.progress) {
        if (row.duration <= 60_000 || row.position >= row.duration * 0.9) {
          continue;
        }
        const existing = base.get(row.contentId);
        if (existing && existing.lastWatched >= row.lastWatched) {
          continue;
        }
        base.set(row.contentId, {
          id: row.contentId,
          type: row.contentType,
          videoId: row.videoId,
          season: row.season,
          episode: row.episode,
          progress: row.position / row.duration,
          remainingMs: Math.max(0, row.duration - row.position),
          lastWatched: row.lastWatched,
        });
      }
      return base;
    }
    for (const [index, row] of (ssrResume ?? []).entries()) {
      base.set(row.id, {
        id: row.id,
        type: row.type,
        videoId: row.videoId,
        season: row.season,
        episode: row.episode,
        progress: row.progress,
        remainingMs: row.remainingMs,
        lastWatched: -index,
      });
    }
    return base;
  }

  // Merge a base row with the enriched-query hit and the library mirror, in that
  // order of preference, down to the card's own fallback art.
  function resumeCard(entry: ResumeBase): ResumeRow {
    const rich = enrichedById.get(entry.id);
    const lib = sync.library.find((record) => record.contentId === entry.id);
    return {
      id: entry.id,
      type: entry.type,
      name: rich?.name ?? lib?.name ?? entry.id,
      poster: rich?.poster ?? lib?.poster ?? null,
      background: rich?.background ?? lib?.background ?? lib?.poster ?? null,
      logo: rich?.logo ?? null,
      videoId: rich?.videoId ?? entry.videoId,
      season: rich?.season ?? entry.season,
      episode: rich?.episode ?? entry.episode,
      progress: rich?.progress ?? entry.progress,
      remainingMs: rich?.remainingMs ?? entry.remainingMs,
    };
  }

  const resume = $derived.by<ResumeRow[]>(() => {
    const cards = new Map<string, ResumeRow>();

    for (const entry of [...baseResumeRows().values()].sort(
      (a, b) => b.lastWatched - a.lastWatched,
    )) {
      if (!dismissed.has(entry.id)) {
        cards.set(entry.id, resumeCard(entry));
      }
    }

    // A finished series that rolled forward to its next episode: `progress` is
    // now 0 so it isn't "in progress" locally : the load's resolved rows are
    // its only source.
    for (const item of ssrResume) {
      if (!(cards.has(item.id) || dismissed.has(item.id))) {
        cards.set(item.id, item);
      }
    }

    return [...cards.values()]
      .filter((item) => item.progress < 0.9)
      .slice(0, 20);
  });

  // The "My library" row reads the local store once it's authoritative so an
  // add/remove (incl. a right-click action on any poster) reflects instantly —
  // unless the store is authoritative-but-empty over a non-empty SSR payload.
  const library = $derived(
    sync.authoritative &&
      (sync.library.length > 0 || (ssrLibrary ?? []).length === 0)
      ? sync.library.map((record) => ({
          id: record.contentId,
          type: record.contentType,
          name: record.name,
          poster: record.poster ?? undefined,
          releaseInfo: record.releaseInfo ?? undefined,
          imdbRating: record.imdbRating ?? undefined,
        }))
      : (ssrLibrary ?? []),
  );

  // Catalog rows are fetched by the load and streamed down with the page, so
  // they don't wait on hydration plus a round trip. Still unawaited there, so
  // a slow addon never stalls navigation : the skeletons below cover it.
  const rowsStream = streamed(
    () => data.rows,
    null as Awaited<typeof data.rows>,
  );
  const rows = $derived(rowsStream.current ?? []);
  const rowsLoading = $derived(!rowsStream.ready);
  const rowsFailed = $derived(rowsStream.ready && rowsStream.current === null);

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

  // Touch swipe : the arrow buttons are desktop-only (`hidden sm:flex`), so a
  // touch viewer's only way to step the carousel is otherwise the dots.
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swiping = false;
  const SWIPE_THRESHOLD = 40;

  function onHeroPointerDown(event: PointerEvent) {
    if (event.pointerType !== "touch") {
      return;
    }
    swiping = true;
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
  }

  function onHeroPointerUp(event: PointerEvent) {
    if (!swiping) {
      return;
    }
    swiping = false;
    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    // Mostly-vertical drags (scrolling the page) don't count as a swipe.
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) {
      return;
    }
    if (spotlights.length < 2) {
      return;
    }
    stepHero(dx < 0 ? 1 : -1);
  }

  const spotlight = $derived(spotlights[heroIndex] ?? null);

  const spotlightHref = $derived(
    spotlight
      ? resolve(`detail/${spotlight.type}/${encodeURIComponent(spotlight.id)}`)
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
  <!-- Stable page heading : the hero title rotates, so a screen reader must not
	     hear a changing movie name as the `h1`. -->
  <h1 class="sr-only">Home</h1>
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
      onpointerdown={onHeroPointerDown}
      onpointerup={onHeroPointerUp}
      onpointercancel={() => (swiping = false)}
      class="grid touch-pan-y *:col-start-1 *:row-start-1"
    >
      {#key spotlight.id}
        <div
          in:fly={reduced({
            x: heroDir * HERO_SLIDE,
            duration: 480,
            easing: cubicOut,
          })}
          out:fly={reduced({
            x: heroDir * -HERO_SLIDE,
            duration: 360,
            easing: cubicOut,
          })}
        >
          <MediaHero
            title={spotlight.name}
            headingLevel={2}
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
                class="group"
                variant="outline"
                onclick={toggleSpotlightLibrary}
              >
                {#if spotlightInLibrary}
                  <BookmarkIcon
                    data-icon="inline-start"
                    class="block group-hover:hidden"
                  />
                  <BookmarkOffIcon
                    class="hidden group-hover:block"
                    data-icon="inline-start"
                  />
                  Remove from Library
                {:else}
                  <BookmarkIcon
                    class="block group-hover:hidden"
                    data-icon="inline-start"
                  />
                  <BookmarkCheckIcon
                    class="hidden group-hover:block"
                    data-icon="inline-start"
                  />
                  Add to library
                {/if}
              </Button>
              <Button size="lg" variant="outline" href={spotlightHref}>
                <InfoIcon data-icon="inline-start" />
                More info
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
      <div
        class="absolute inset-0 -z-10 bg-linear-to-br from-muted/60 to-background"
      ></div>
      <div
        class="mx-auto flex items-end gap-8 px-6 pt-32 pb-12 lg:min-h-[72vh] lg:pb-14"
      >
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
    <h2 class="text-3xl font-bold tracking-tight">
      Welcome back, {profileName}
    </h2>
  {/if}

  <!-- Anchored to normal document flow (not `fixed`) so it starts exactly
	     where the hero's own box ends, at any hero height or viewport size —
	     no viewport-unit guessing. Its own top fade keeps the glow from
	     switching on abruptly right at that seam. -->
  <div class="relative flex flex-col gap-12">
    <AuroraBackground
      class="-z-10 opacity-45 mask-[linear-gradient(to_bottom,transparent,black_220px)]"
    />

    {#if resume.length > 0}
      <section class="flex flex-col gap-3">
        <h2 class="text-xl font-semibold tracking-tight">Continue watching</h2>
        <div
          class="no-scrollbar -mx-2 flex gap-4 overflow-x-auto scroll-smooth px-2 pt-1 pb-2"
        >
          {#each resume as item (`${item.type}:${item.videoId}`)}
            <ContinueWatchingCard {item} onClear={dismiss} />
          {/each}
        </div>
      </section>
    {/if}

    {#if library.length > 0}
      <MediaRow title="My library" items={library} href={resolve("library")} />
    {/if}

    {#if rowsFailed}
      <QueryError
        message="Couldn't load your catalog rows."
        onRetry={() => invalidateAll()}
      />
    {:else if rowsLoading}
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
        <div
          class="mx-auto max-w-md rounded-2xl border border-border/60 bg-linear-to-b from-muted/40 to-transparent px-6 py-14 text-center"
        >
          <span
            class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border"
          >
            <SparklesIcon class="size-7" />
          </span>
          <p class="mt-4 text-lg font-semibold tracking-tight">
            Your home feed is empty
          </p>
          <p class="mt-1 text-sm text-muted-foreground">
            Add a catalog addon and rows of movies and series fill in here.
          </p>

          <Button href={resolve("addons")} variant="outline" class="mt-4"
            >Manage addons</Button
          >
        </div>
      </div>
    {:else}
      {#each rows as row, index (`${row.addonId}:${row.type}:${row.id}`)}
        <MediaRow
          title={rowTitles[index]}
          items={row.metas}
          href={resolve(
            `discover?c=${encodeURIComponent(`${row.addonId}|${row.type}|${row.id}`)}`,
          )}
        />
      {/each}
    {/if}
  </div>
</div>
