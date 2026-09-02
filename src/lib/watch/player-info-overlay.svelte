<script lang="ts">
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlayIcon from "@lucide/svelte/icons/play";
	import XIcon from "@lucide/svelte/icons/x";
	import { Dialog as DialogPrimitive } from "bits-ui";
	import { fade, fly } from "svelte/transition";
	import ImdbRating from "#lib/components/imdb-rating.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { reduced } from "#lib/motion.js";
	import type { PlayerInfo } from "./player-info.ts";

	let {
		title,
		subheading = null,
		logo = null,
		poster = null,
		certification = null,
		genres = [],
		info,
		detailHref,
		autoOpened = false,
		onResume,
		onClose,
	}: {
		title: string;
		subheading?: string | null;
		logo?: string | null;
		background?: string | null;
		poster?: string | null;
		certification?: string | null;
		genres?: string[];
		info: PlayerInfo;
		detailHref: string;
		/** Surfaced by a pause rather than the Info button : offer a Resume CTA. */
		autoOpened?: boolean;
		onResume?: () => void;
		onClose: () => void;
	} = $props();

	let logoBroken = $state(false);

	const headline = $derived(info.episodeTitle ?? title);
	const synopsis = $derived(
		info.episodeOverview ?? info.description ?? "No synopsis available.",
	);
	const metaBits = $derived(
		[info.releaseInfo, info.runtime, certification, info.status].filter(
			(bit): bit is string => Boolean(bit),
		),
	);
	const facts = $derived(
		[
			["Cast", info.cast.join(", ")],
			["Director", info.director.join(", ")],
			["Writer", info.writer.join(", ")],
			["Country", info.country ?? ""],
			["Awards", info.awards ?? ""],
		].filter(([, value]) => value.length > 0) as Array<[string, string]>,
	);

	function onOpenChange(open: boolean) {
		if (!open) {
			onClose();
		}
	}
</script>

<!-- Dims the whole player and lays the info over it. Sits BELOW the transport
     controls (z-30) whose bars stay click-through, so the Back button and bottom
     bar remain live. Dismiss with the ✕, the Info button, Escape or a CTA —
     never by clicking the body. `DialogPrimitive` gives us focus-trap + restore
     for free; the `child` snippet keeps our own markup and Svelte transitions. -->
<DialogPrimitive.Root open {onOpenChange}>
  <DialogPrimitive.Content>
    {#snippet child({ props })}
      <div
        {...props}
        class="absolute inset-0 z-20 overflow-hidden outline-none"
        transition:fade={reduced({ duration: 150 })}
      >
        <div class="absolute inset-0 bg-black/85"></div>

        <!-- Confined between the player's top bar and its bottom control bar;
				     vertically centred, left-aligned. Scrolls inside its box when too tall. -->
        <div
          class="absolute inset-x-0 top-16 bottom-20 flex items-center justify-start px-6 pb-6 sm:top-20 sm:bottom-24 sm:px-12"
          transition:fly={reduced({ y: 16, duration: 220 })}
        >
          <div
            class="flex max-h-full w-full max-w-4xl flex-col gap-4 text-white"
          >
            <div class="flex shrink-0 items-center gap-3">
              <span
                class="flex flex-1 items-center gap-1.5 text-xs font-semibold tracking-[0.2em] text-white/50 uppercase"
              >
                <InfoIcon class="size-3.5" />
                {info.episodeTitle
                  ? subheading || "Episode"
                  : "About this title"}
              </span>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Close"
                onclick={onClose}
                class="shrink-0 rounded-full"
              >
                <XIcon class="size-5" />
              </Button>
            </div>

            <div
              class="flex min-h-0 flex-1 gap-7 overflow-y-auto pr-1 scrollbar-thin md:gap-10"
            >
              {#if poster}
                <img
                  src={poster}
                  alt=""
                  class="hidden w-40 shrink-0 self-start rounded-2xl object-cover shadow-[0_40px_80px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/10 md:block lg:w-52"
                />
              {/if}

              <div class="flex min-w-0 flex-1 flex-col gap-4">
                {#if logo && !logoBroken}
                  <img
                    src={logo}
                    alt={title}
                    onerror={() => (logoBroken = true)}
                    class="max-h-20 max-w-64 self-start object-contain object-left drop-shadow-lg"
                  />
                  {#if info.episodeTitle}
                    <h2 class="text-xl font-semibold">{info.episodeTitle}</h2>
                  {/if}
                {:else}
                  <h2
                    class="text-2xl font-bold tracking-tight text-balance sm:text-3xl"
                  >
                    {headline}
                  </h2>
                {/if}

                {#if info.imdbRating || metaBits.length > 0 || genres.length > 0}
                  <div
                    class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-medium text-white/70"
                  >
                    {#if info.imdbRating}
                      <ImdbRating
                        rating={info.imdbRating}
                        size="md"
                        label
                        class="text-white"
                      />
                    {/if}
                    {#each metaBits as bit (bit)}
                      <span>{bit}</span>
                    {/each}
                    {#if genres.length > 0}
                      <span class="flex flex-wrap gap-1.5">
                        {#each genres.slice(0, 4) as genre (genre)}
                          <span
                            class="rounded-full bg-white/10 px-2 py-0.5 text-xs"
                          >
                            {genre}
                          </span>
                        {/each}
                      </span>
                    {/if}
                  </div>
                {/if}

                <p class="max-w-2xl text-sm leading-relaxed text-white/85">
                  {synopsis}
                </p>

                {#if info.episodeOverview && info.description}
                  <p
                    class="line-clamp-3 max-w-2xl text-xs leading-relaxed text-white/55"
                  >
                    {info.description}
                  </p>
                {/if}

                {#if facts.length > 0}
                  <dl class="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                    {#each facts as [label, value] (label)}
                      <div class="flex flex-col">
                        <dt
                          class="text-xs font-semibold tracking-wide text-white/40 uppercase"
                        >
                          {label}
                        </dt>
                        <dd class="text-white/80">{value}</dd>
                      </div>
                    {/each}
                  </dl>
                {/if}
              </div>
            </div>

            <div class="flex shrink-0 flex-wrap items-center gap-3">
              {#if autoOpened && onResume}
                <Button
                  size="lg"
                  onclick={onResume}
                  class="gap-2 rounded-full font-semibold"
                >
                  <PlayIcon
                    data-icon="inline-start"
                    class="size-4 fill-current"
                  />Resume
                </Button>
              {:else}
                <Button
                  size="lg"
                  onclick={onClose}
                  class="gap-2 rounded-full font-semibold"
                >
                  <PlayIcon
                    data-icon="inline-start"
                    class="size-4 fill-current"
                  />Keep watching
                </Button>
              {/if}
              <Button
                variant="secondary"
                size="lg"
                href={detailHref}
                class="rounded-full font-medium"
              >
                Full details
              </Button>
            </div>
          </div>
        </div>
      </div>
    {/snippet}
  </DialogPrimitive.Content>
</DialogPrimitive.Root>
