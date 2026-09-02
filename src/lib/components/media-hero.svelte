<script lang="ts">
  import { mode } from "mode-watcher";
  import type { Snippet } from "svelte";
  import ImdbRating from "#lib/components/imdb-rating.svelte";
  import { backdropSrcset } from "#lib/images.js";
  import { theme } from "#lib/settings/theme.svelte.js";

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
    headingLevel = 1,
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
    /** Official streaming home, e.g. "Prime Video" : shown as an accent chip. */
    network?: string | null;
    showPoster?: boolean;
    /** Heading level for the title. Home demotes it to 2 (a stable `sr-only`
     *  "Home" `h1` owns the page heading there). */
    headingLevel?: 1 | 2;
    actions?: Snippet;
    /** Rendered inside the hero `<section>` : e.g. carousel dots. */
    overlay?: Snippet;
  } = $props();

  const headingTag = $derived(`h${headingLevel}` as "h1" | "h2");

  // The `.dark` scope below re-declares every dark-palette token : including
  // `--background` (shadowing the AMOLED override) and `--primary`/`--ring`
  // (shadowing the chosen accent colour) : because both of those overrides
  // are plain attribute selectors that only re-match an element that itself
  // carries the attribute. Mirror both here so the hero doesn't silently
  // fall back to dim dark-grey backgrounds and a neutral (grey/white)
  // accent instead of the real ones.
  const amoled = $derived(theme.current.darkStyle === "amoled");
  const accent = $derived(theme.current.accent);
  // Bleeding the hero's fade into the *real* page colour only reads well
  // when that colour is already dark-ish (dark / AMOLED) : against a light
  // page it's a much bigger jump and a gradient there looks muddy, not
  // seamless. Light mode keeps a clean, deliberate cut instead.
  const bleedIntoPage = $derived(mode.current === "dark");

  let logoBroken = $state(false);
  $effect(() => {
    void logo;
    logoBroken = false;
  });

  // Blur-up: the poster (small, usually already cached) shows blurred until the
  // full backdrop paints, then the backdrop fades in over it. Sync the flag from
  // the element : a reused `<img>` whose `src` didn't change fires no new `load`
  // event, which would otherwise leave the backdrop stuck at `opacity-0`.
  let backdropEl = $state<HTMLImageElement>();
  let backdropLoaded = $state(false);
  $effect(() => {
    void background;
    backdropLoaded = Boolean(
      backdropEl?.complete && backdropEl.naturalWidth > 0,
    );
  });
</script>

<!-- `dark` scopes the scrims + copy to the dark palette regardless of the app
     theme : a cinematic backdrop is dark media either way, and a white scrim
     over it (light mode) washed the image to a grey smear. That also shadows
     `--background` itself though, so capture the *real* ambient page colour
     here, outside the `.dark` rescope, and use it (not the forced-dark token)
     for the strip that has to match the page content below. -->
<div style="--hero-page-bg: var(--background)">
  <section
    class="dark relative isolate mx-[calc(50%-50vw)] -mt-20 overflow-hidden text-foreground"
    data-amoled={amoled ? "true" : undefined}
    data-accent={accent}
  >
    <div class="absolute inset-0 -z-10">
      {#if background}
        {@const bd = backdropSrcset(background)}
        {#if poster && !backdropLoaded}
          <img
            src={poster}
            alt=""
            class="absolute inset-0 size-full scale-110 object-cover object-top blur-2xl saturate-150"
          />
        {/if}
        <img
          bind:this={backdropEl}
          src={background}
          srcset={bd?.srcset}
          sizes={bd?.sizes}
          alt=""
          onload={() => (backdropLoaded = true)}
          class={`animate-hero-zoom size-full object-cover object-top transition-opacity duration-700 ${backdropLoaded ? "opacity-100" : "opacity-0"}`}
        />
      {:else if poster}
        <img
          src={poster}
          alt=""
          class="size-full scale-110 object-cover object-top blur-3xl saturate-150"
        />
      {:else}
        <div class="size-full bg-linear-to-br from-muted to-background"></div>
      {/if}
      <!-- Accent bloom rising from the lower-left, where the title sits. Sits
         BELOW the fade-to-background layers so the solid strip at the very
         bottom stays pure `background` : otherwise the glow bleeds through it
         and seams against the page content below. -->
      <div
        class="absolute -bottom-1/3 left-0 h-2/3 w-2/3 opacity-50 blur-3xl"
        style="background: radial-gradient(closest-side, color-mix(in oklch, var(--primary) 24%, transparent), transparent)"
      ></div>
      <!-- Vertical bleed: solid page background for the bottom third, fading up to
         clear so the image melds seamlessly into the page below. -->
      <div
        class="absolute inset-0 bg-linear-to-t from-background from-15% via-background/45 via-55% to-transparent to-90%"
      ></div>
      <div
        class="absolute inset-0 bg-linear-to-r from-background/90 via-background/40 to-transparent"
      ></div>
      <div
        class="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-background/60 to-transparent"
      ></div>
      {#if bleedIntoPage}
        <!-- Dark / AMOLED only : bridges the forced-dark solid strip above into
           the *real* ambient page colour right at the very edge. Skipped in
           light mode: the jump to white is too big for a gradient to read as
           anything but muddy, so that stays a clean, deliberate cut. -->
        <div
          class="absolute inset-x-0 bottom-0 h-[12%] bg-linear-to-t from-(--hero-page-bg) to-transparent"
        ></div>
      {/if}
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
          <svelte:element this={headingTag} class="sr-only"
            >{title}</svelte:element
          >
        {:else}
          <svelte:element
            this={headingTag}
            class="text-4xl font-bold tracking-tight text-balance drop-shadow-md lg:text-6xl"
          >
            {title}
          </svelte:element>
        {/if}

        {#if flag || network || rating || year || runtime || genres.length > 0}
          <div
            class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-foreground/70"
          >
            {#if flag}
              <span
                class="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"
              >
                {flag}
              </span>
            {/if}
            {#if network}
              <span
                class="flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-semibold text-foreground/80"
              >
                {network}
              </span>
            {/if}
            {#if rating}
              <ImdbRating {rating} size="md" label class="text-foreground" />
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
</div>
