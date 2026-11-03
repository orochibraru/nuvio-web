<script lang="ts">
	import CalendarDaysIcon from "@lucide/svelte/icons/calendar-days";
	import TvIcon from "@lucide/svelte/icons/tv";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { type CalendarEntry, groupByDay } from "#lib/library/calendar.js";
	import { episodeLabel } from "#lib/watch/episodes.js";
	import { resolve } from "$app/paths";

	pageTitle.set(m.nav_calendar());

	let { data } = $props();

	const entriesStream = streamed(() => data.entries, [] as CalendarEntry[]);
	const days = $derived(
		groupByDay(entriesStream.current, Date.now(), getLocale()),
	);
	const sections = $derived(
		[
			{ heading: m.calendar_upcoming(), days: days.upcoming },
			{ heading: m.calendar_recent(), days: days.recent },
		].filter((section) => section.days.length > 0),
	);
</script>

{#snippet entryCard(entry: CalendarEntry)}
  <a
    href={resolve(`detail/series/${encodeURIComponent(entry.id)}`)}
    class="flex items-center gap-3 rounded-2xl bg-muted/40 p-2 ring-1 ring-border transition-colors hover:bg-muted active:scale-[0.99] dark:ring-white/10"
  >
    <div
      class="flex aspect-2/3 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
    >
      {#if entry.poster}
        <img
          src={entry.poster}
          alt=""
          loading="lazy"
          decoding="async"
          class="size-full object-cover"
        />
      {:else}
        <TvIcon class="size-5 text-muted-foreground/50" />
      {/if}
    </div>
    <div class="min-w-0">
      <p class="truncate text-sm font-semibold">{entry.name}</p>
      <p class="truncate text-xs text-muted-foreground">
        {episodeLabel(entry)}
      </p>
    </div>
  </a>
{/snippet}

<div class="flex flex-col gap-8">
  <div class="flex flex-col gap-1">
    <h1 class="text-3xl font-bold tracking-tight">{m.nav_calendar()}</h1>
    <p class="text-sm text-muted-foreground">{m.calendar_subtitle()}</p>
  </div>

  {#if !entriesStream.ready}
    <div class="flex flex-col gap-3" aria-hidden="true">
      <div class="skeleton h-5 w-28 rounded-md"></div>
      <div
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
      >
        {#each { length: 8 } as _skeleton, index (index)}
          <div class="skeleton h-25 rounded-2xl"></div>
        {/each}
      </div>
    </div>
  {:else if sections.length === 0}
    <EmptyState
      icon={CalendarDaysIcon}
      title={m.calendar_empty_title()}
      description={m.calendar_empty_description()}
    >
      {#snippet actions()}
        <Button href={resolve("library")} variant="outline">{m.nav_library()}</Button>
      {/snippet}
    </EmptyState>
  {:else}
    {#each sections as section (section.heading)}
      <div class="flex flex-col gap-6">
        <h2 class="text-xl font-bold tracking-tight">{section.heading}</h2>
        {#each section.days as day (day.key)}
          <section aria-labelledby={`day-${day.key}`} class="flex flex-col gap-3">
            <h3
              id={`day-${day.key}`}
              class="text-sm font-semibold text-muted-foreground first-letter:uppercase"
            >
              {day.label}
            </h3>
            <ul
              class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
            >
              {#each day.entries as entry (`${entry.id}:${entry.season}:${entry.episode}`)}
                <li>{@render entryCard(entry)}</li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {/each}
  {/if}
</div>
