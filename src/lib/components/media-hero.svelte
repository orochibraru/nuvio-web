<script lang="ts">
	import StarIcon from "@lucide/svelte/icons/star";
	import type { Snippet } from "svelte";
	import { backdropSrcset } from "$lib/images.js";

	let {
		title,
		logo = null,
		background = null,
		poster = null,
		eyebrow = null,
		description = null,
		rating = null,
		year = null,
		runtime = null,
		genres = [],
		flag = null,
		network = null,
		showPoster = false,
		actions,
		overlay,
	}: {
		title: string;
		logo?: string | null;
		background?: string | null;
		poster?: string | null;
		eyebrow?: string | null;
		description?: string | null;
		rating?: string | null;
		year?: string | null;
		runtime?: string | null;
		genres?: string[];
		/** Small status pill shown before the meta line (e.g. "Watched"). */
		flag?: string | null;
		/** Official streaming home, e.g. "Prime Video" — shown as an accent chip. */
		network?: string | null;
		showPoster?: boolean;
		actions?: Snippet;
		/** Rendered inside the hero `<section>` — e.g. carousel dots. */
		overlay?: Snippet;
	} = $props();

	let logoBroken = $state(false);
	$effect(() => {
		void logo;
		logoBroken = false;
	});

	// Blur-up: the poster (small, usually already cached) shows blurred until the
	// full backdrop paints, then the backdrop fades in over it.
	let backdropLoaded = $state(false);
	$effect(() => {
		void background;
		backdropLoaded = false;
	});
</script>

<section
  class="relative isolate mx-[calc(50%-50vw)] -mt-20 mb-2 overflow-hidden"
>
  <div class="absolute inset-0 -z-10">
    {#if background}
      {@const bd = backdropSrcset(background)}
      {#if poster && !backdropLoaded}
        <img
          src={poster}
          alt=""
          class="absolute inset-0 size-full scale-110 object-cover blur-2xl saturate-150"
        />
      {/if}
      <img
        src={background}
        srcset={bd?.srcset}
        sizes={bd?.sizes}
        alt=""
        onload={() => (backdropLoaded = true)}
        class={`animate-hero-zoom size-full object-cover object-center transition-opacity duration-700 ${backdropLoaded ? "opacity-100" : "opacity-0"}`}
      />
    {:else if poster}
      <img
        src={poster}
        alt=""
        class="size-full scale-110 object-cover blur-3xl saturate-150"
      />
    {:else}
      <div class="size-full bg-linear-to-br from-muted to-background"></div>
    {/if}
    <div
      class="absolute inset-0 bg-linear-to-t from-background via-background/55 to-background/20"
    ></div>
    <div
      class="absolute inset-0 bg-linear-to-r from-background via-background/45 to-transparent"
    ></div>
    <div
      class="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-background/70 to-transparent"
    ></div>
    <!-- Accent bloom rising from the lower-left, where the title sits. -->
    <div
      class="absolute -bottom-1/3 left-0 h-2/3 w-2/3 opacity-60 blur-3xl"
      style="background: radial-gradient(closest-side, color-mix(in oklch, var(--primary) 28%, transparent), transparent)"
    ></div>
    <!-- Vignette. -->
    <div
      class="absolute inset-0"
      style="background: radial-gradient(120% 120% at 50% 0%, transparent 55%, color-mix(in oklch, var(--background) 65%, transparent))"
    ></div>
  </div>

  <div
    class="mx-auto flex items-end gap-8 px-6 pt-32 pb-12 lg:min-h-[72vh] lg:pb-14"
  >
    {#if showPoster && poster}
      <div
        class="hidden w-52 shrink-0 overflow-hidden rounded-2xl shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10 lg:block"
      >
        <img
          src={poster}
          alt={title}
          class="aspect-2/3 size-full object-cover"
        />
      </div>
    {/if}

    <div class="flex max-w-2xl flex-col gap-4">
      {#if eyebrow}
        <span
          class="text-xs font-semibold tracking-[0.22em] text-primary uppercase"
        >
          {eyebrow}
        </span>
      {/if}

      {#if logo && !logoBroken}
        <img
          src={logo}
          alt={title}
          onerror={() => (logoBroken = true)}
          class="max-h-24 max-w-xs self-start object-contain object-left drop-shadow-lg lg:max-h-36 lg:max-w-md"
        />
        <h1 class="sr-only">{title}</h1>
      {:else}
        <h1
          class="text-4xl font-bold tracking-tight text-balance drop-shadow-md lg:text-6xl"
        >
          {title}
        </h1>
      {/if}

      {#if flag || network || rating || year || runtime || genres.length > 0}
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-foreground/70"
        >
          {#if flag}
            <span class="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              {flag}
            </span>
          {/if}
          {#if network}
            <span class="flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-semibold text-foreground/80">
              {network}
            </span>
          {/if}
          {#if rating}
            <span class="flex items-center gap-1 text-foreground" title="IMDb rating">
              <StarIcon class="size-3.5 fill-amber-400 text-amber-400" />
              {rating}
              <span class="text-[10px] font-semibold tracking-wide text-foreground/45">IMDb</span>
            </span>
          {/if}
          {#if year}<span>{year}</span>{/if}
          {#if runtime}<span>{runtime}</span>{/if}
          {#if genres.length > 0}
            <span>{genres.slice(0, 3).join(" · ")}</span>
          {/if}
        </div>
      {/if}

      {#if description}
        <p
          class="line-clamp-3 max-w-xl text-sm leading-relaxed text-foreground/80 lg:text-base"
        >
          {description}
        </p>
      {/if}

      {#if actions}
        <div class="mt-2 flex flex-wrap items-center gap-3">
          {@render actions()}
        </div>
      {/if}
    </div>
  </div>

  {#if overlay}
    {@render overlay()}
  {/if}
</section>
