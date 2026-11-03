<script lang="ts">
	import type { WeekSplit } from "#lib/admin/stats-data.js";
	import { getLocale, m } from "#lib/i18n/index.js";

	let { weeks }: { weeks: WeekSplit[] } = $props();

	const HEIGHT = 72;
	const SEGMENT_GAP = 1.5;
	const RADIUS = 2;

	const totals = $derived(
		weeks.map((week) => week.newPeople + week.returningPeople),
	);
	const peak = $derived(Math.max(1, ...totals));
	const step = $derived(weeks.length > 0 ? 100 / weeks.length : 100);
	const barWidth = $derived(step * 0.6);
	const isEmpty = $derived(totals.every((total) => total === 0));
	const numberFormat = $derived(new Intl.NumberFormat(getLocale()));

	function weekLabel(day: string): string {
		return new Date(`${day}T00:00:00Z`).toLocaleDateString(getLocale(), {
			timeZone: "UTC",
			month: "short",
			day: "numeric",
		});
	}

	function scaled(count: number): number {
		return (count / peak) * HEIGHT;
	}
</script>

<figure class="flex min-w-0 flex-col gap-3">
	<figcaption class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
		<span class="flex items-center gap-1.5">
			<span class="size-2.5 rounded-sm bg-primary" aria-hidden="true"></span>
			{m.admin_stats_returning()}
		</span>
		<span class="flex items-center gap-1.5">
			<span class="size-2.5 rounded-sm bg-primary/40" aria-hidden="true"></span>
			{m.admin_stats_new_people()}
		</span>
	</figcaption>

	{#if isEmpty}
		<p
			class="rounded-lg border border-dashed border-foreground/15 px-3 py-6 text-center text-sm text-muted-foreground"
		>
			{m.admin_stats_empty_activity()}
		</p>
	{:else}
		<svg
			viewBox={`0 0 100 ${HEIGHT}`}
			preserveAspectRatio="none"
			role="img"
			aria-label={m.admin_stats_weeks_aria({ count: weeks.length })}
			class="h-24 w-full overflow-visible"
		>
			{#each weeks as week, index (week.weekStart)}
				{@const returning = scaled(week.returningPeople)}
				{@const fresh = scaled(week.newPeople)}
				{@const x = index * step + (step - barWidth) / 2}
				<g class="transition-opacity hover:opacity-70">
					<rect x={index * step} y={0} width={step} height={HEIGHT} class="fill-transparent">
						<title
							>{m.admin_stats_week_bar({
								week: weekLabel(week.weekStart),
								returning: week.returningPeople,
								fresh: week.newPeople,
							})}</title
						>
					</rect>
					{#if returning > 0}
						<rect
							{x}
							y={HEIGHT - returning}
							width={barWidth}
							height={returning}
							rx={fresh > 0 ? 0 : RADIUS}
							class="pointer-events-none fill-primary"
						/>
					{/if}
					{#if fresh > 0}
						<rect
							{x}
							y={HEIGHT - returning - fresh - (returning > 0 ? SEGMENT_GAP : 0)}
							width={barWidth}
							height={fresh}
							rx={RADIUS}
							class="pointer-events-none fill-primary/40"
						/>
					{/if}
				</g>
			{/each}
			<line
				x1="0"
				y1={HEIGHT}
				x2="100"
				y2={HEIGHT}
				class="stroke-foreground/15"
				stroke-width="0.5"
				vector-effect="non-scaling-stroke"
			/>
		</svg>

		<div class="flex justify-between text-xs text-muted-foreground">
			<span>{weeks[0] ? weekLabel(weeks[0].weekStart) : ""}</span>
			<span>{m.admin_stats_this_week()}</span>
		</div>

		<details class="text-sm">
			<summary
				class="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
			>
				{m.admin_chart_show()}
			</summary>
			<table class="mt-3 w-full text-left">
				<thead class="text-xs text-muted-foreground">
					<tr>
						<th scope="col" class="py-1 font-medium">{m.admin_stats_week_of()}</th>
						<th scope="col" class="py-1 text-right font-medium">{m.admin_stats_returning()}</th>
						<th scope="col" class="py-1 text-right font-medium">{m.admin_stats_new_people()}</th>
					</tr>
				</thead>
				<tbody>
					{#each weeks as week (week.weekStart)}
						<tr class="border-t border-foreground/5">
							<td class="py-1">{weekLabel(week.weekStart)}</td>
							<td class="py-1 text-right tabular-nums">{numberFormat.format(week.returningPeople)}</td>
							<td class="py-1 text-right tabular-nums">{numberFormat.format(week.newPeople)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</details>
	{/if}
</figure>
