<script lang="ts">
	import StarIcon from "@lucide/svelte/icons/star";
	import type { Snippet } from "svelte";

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
		showPoster = false,
		actions,
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
		showPoster?: boolean;
		actions?: Snippet;
	} = $props();

	let logoBroken = $state(false);
	$effect(() => {
		void logo;
		logoBroken = false;
	});
</script>

<section
  class="relative isolate mx-[calc(50%-50vw)] -mt-20 mb-2 overflow-hidden"
>
  <div class="absolute inset-0 -z-10">
    {#if background}
      <img
        src={background}
        alt=""
        class="animate-hero-zoom size-full object-cover object-center"
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

      {#if rating || year || runtime || genres.length > 0}
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-foreground/70"
        >
          {#if rating}
            <span class="flex items-center gap-1 text-foreground">
              <StarIcon class="size-3.5 fill-amber-400 text-amber-400" />
              {rating}
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
</section>
