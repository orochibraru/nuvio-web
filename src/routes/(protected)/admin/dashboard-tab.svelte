<script lang="ts">
	import DayBars from "#lib/admin/day-bars.svelte";
	import StatTile from "#lib/admin/stat-tile.svelte";
	import type {
		DayValue,
		StatsOverview,
		TopTitle,
		WeekSplit,
	} from "#lib/admin/stats-data.js";
	import WeekSplitChart from "#lib/admin/week-split-chart.svelte";
	import * as Card from "#lib/components/ui/card/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { resolve } from "$app/paths";

	let {
		overview,
		activeDays,
		signInDays,
		newAccountDays,
		playDays,
		weeks,
		topTitles,
	}: {
		overview: Promise<StatsOverview | null>;
		activeDays: Promise<DayValue[]>;
		signInDays: Promise<DayValue[]>;
		newAccountDays: Promise<DayValue[]>;
		playDays: Promise<DayValue[]>;
		weeks: Promise<WeekSplit[]>;
		topTitles: Promise<TopTitle[]>;
	} = $props();

	const overviewStream = streamed(() => overview, null);
	const activeStream = streamed(() => activeDays, []);
	const signInStream = streamed(() => signInDays, []);
	const newAccountStream = streamed(() => newAccountDays, []);
	const playStream = streamed(() => playDays, []);
	const weekStream = streamed(() => weeks, []);
	const topStream = streamed(() => topTitles, []);

	const RANGES = [30, 90] as const;
	let range = $state<(typeof RANGES)[number]>(30);

	function lastDays(days: DayValue[]): DayValue[] {
		return days.slice(-range);
	}

	function sum(days: DayValue[]): number {
		return days.reduce((total, day) => total + day.value, 0);
	}

	const active = $derived(lastDays(activeStream.current));
	const signInsShown = $derived(lastDays(signInStream.current));
	const newAccounts = $derived(lastDays(newAccountStream.current));
	const plays = $derived(lastDays(playStream.current));
</script>

<div class="flex flex-col gap-6">
  {#if overviewStream.current}
    {@const stats = overviewStream.current}
    <section
      aria-label={m.admin_stats_overview()}
      class="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8"
    >
      <StatTile
        label={m.admin_stats_daily_active()}
        value={stats.dailyActive.current}
        comparison={stats.dailyActive}
        period={m.admin_stats_period_day()}
      />
      <StatTile
        label={m.admin_stats_weekly_active()}
        value={stats.weeklyActive.current}
        comparison={stats.weeklyActive}
        period={m.admin_stats_period_week()}
      />
      <StatTile
        label={m.admin_stats_monthly_active()}
        value={stats.monthlyActive.current}
        comparison={stats.monthlyActive}
        period={m.admin_stats_period_month()}
      />
      <StatTile
        label={m.admin_stats_new_accounts()}
        value={stats.newAccounts.current}
        comparison={stats.newAccounts}
        period={m.admin_stats_period_month()}
      />
      <StatTile
        label={m.admin_stats_total_accounts()}
        value={stats.totalAccounts}
        detail={m.admin_stats_live_sessions({ count: stats.liveSessions })}
      />
      <StatTile
        label={m.admin_stats_plays()}
        value={stats.plays.current}
        comparison={stats.plays}
        period={m.admin_stats_period_week()}
      />
      <StatTile
        label={m.admin_stats_hours()}
        value={stats.hoursWatched.current}
        comparison={stats.hoursWatched}
        period={m.admin_stats_period_week()}
      />
    </section>
  {:else if overviewStream.ready}
    <p class="text-sm text-muted-foreground">{m.shell_couldnt_load()}</p>
  {:else}
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8" aria-hidden="true">
      {#each { length: 7 }, index (index)}
        <div class="h-24 animate-pulse rounded-xl bg-muted"></div>
      {/each}
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
    <Card.Root class="border border-foreground/10">
      <Card.Header>
        <Card.Title>{m.admin_stats_top_titles()}</Card.Title>
        <Card.Description>{m.admin_stats_top_titles_description()}</Card.Description>
      </Card.Header>
      <Card.Content>
        {#if topStream.current.length === 0}
          <p class="py-6 text-center text-sm text-muted-foreground">
            {m.admin_stats_top_titles_empty()}
          </p>
        {:else}
          <ol class="flex flex-col divide-y divide-foreground/10">
            {#each topStream.current as title, index (title.contentId)}
              <li class="flex items-center gap-3 py-2 text-sm">
                <span class="w-5 text-right text-muted-foreground tabular-nums">{index + 1}</span>
                <a
                  href={resolve(`detail/${encodeURIComponent(title.contentType)}/${encodeURIComponent(title.contentId)}`)}
                  class="min-w-0 flex-1 truncate hover:underline"
                >
                  {title.name}
                </a>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {m.admin_stats_top_accounts({ count: title.accounts })}
                </span>
              </li>
            {/each}
          </ol>
        {/if}
      </Card.Content>
    </Card.Root>

    <Card.Root class="border border-foreground/10">
      <Card.Header>
        <Card.Title>{m.admin_stats_weeks()}</Card.Title>
        <Card.Description>{m.admin_stats_weeks_description()}</Card.Description>
      </Card.Header>
      <Card.Content>
        <WeekSplitChart weeks={weekStream.current} />
      </Card.Content>
    </Card.Root>
  </div>

  <div class="flex flex-wrap items-center gap-2" role="group" aria-label={m.admin_stats_range()}>
    {#each RANGES as option (option)}
      <button
        type="button"
        aria-pressed={range === option}
        onclick={() => (range = option)}
        class="rounded-full border px-3 py-1 text-sm transition-colors {range === option
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-foreground/15 text-muted-foreground hover:text-foreground'}"
      >
        {m.admin_stats_last_days({ count: option })}
      </button>
    {/each}
  </div>

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-4">
    <Card.Root class="border border-foreground/10">
      <Card.Header>
        <Card.Title>{m.admin_stats_active_title()}</Card.Title>
        <Card.Description>{m.admin_stats_active_description()}</Card.Description>
      </Card.Header>
      <Card.Content>
        <DayBars
          days={active}
          label={m.admin_stats_active_label()}
          summary={Math.max(0, ...active.map((day) => day.value))}
          valueLabel={m.admin_chart_people()}
          barTitle={(day, label) => m.admin_stats_active_bar({ day: label, people: day.value })}
          emptyText={m.admin_stats_empty_activity()}
        />
      </Card.Content>
    </Card.Root>

    <Card.Root class="border border-foreground/10">
      <Card.Header>
        <Card.Title>{m.admin_activity()}</Card.Title>
        <Card.Description>{m.admin_activity_description()}</Card.Description>
      </Card.Header>
      <Card.Content>
        <DayBars
          days={signInsShown}
          label={m.admin_chart_label()}
          summary={sum(signInsShown)}
          valueLabel={m.admin_sign_ins()}
          peopleLabel={m.admin_chart_people()}
          barTitle={(day, label) =>
            day.value === 0
              ? m.admin_chart_day_empty({ day: label })
              : m.admin_chart_bar({ day: label, signIns: day.value, people: day.people })}
          emptyText={m.admin_chart_empty()}
        />
      </Card.Content>
    </Card.Root>

    <Card.Root class="border border-foreground/10">
      <Card.Header>
        <Card.Title>{m.admin_stats_new_accounts()}</Card.Title>
        <Card.Description>{m.admin_stats_new_accounts_description()}</Card.Description>
      </Card.Header>
      <Card.Content>
        <DayBars
          days={newAccounts}
          label={m.admin_stats_new_accounts_label()}
          summary={sum(newAccounts)}
          valueLabel={m.admin_stats_new_accounts()}
          barTitle={(day, label) => m.admin_stats_new_accounts_bar({ day: label, count: day.value })}
          emptyText={m.admin_stats_empty_accounts()}
        />
      </Card.Content>
    </Card.Root>

    <Card.Root class="border border-foreground/10">
      <Card.Header>
        <Card.Title>{m.admin_stats_watch_title()}</Card.Title>
        <Card.Description>{m.admin_stats_watch_description()}</Card.Description>
      </Card.Header>
      <Card.Content>
        <DayBars
          days={plays}
          label={m.admin_stats_watch_label()}
          summary={sum(plays)}
          valueLabel={m.admin_stats_plays()}
          peopleLabel={m.admin_stats_accounts()}
          barTitle={(day, label) =>
            m.admin_stats_watch_bar({ day: label, plays: day.value, accounts: day.people })}
          emptyText={m.admin_stats_empty_watch()}
        />
      </Card.Content>
    </Card.Root>
  </div>

</div>
