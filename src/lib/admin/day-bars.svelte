<script lang="ts">
	import type { DayValue } from "#lib/admin/stats-data.js";
	import { getLocale, m } from "#lib/i18n/index.js";

	let {
		days,
		label,
		summary,
		valueLabel,
		peopleLabel,
		barTitle,
		emptyText,
	}: {
		days: DayValue[];
		label: string;
		summary: number;
		valueLabel: string;
		peopleLabel?: string;
		barTitle: (day: DayValue, dayLabel: string) => string;
		emptyText: string;
	} = $props();

	const HEIGHT = 72;
	const RADIUS = 2;
	const MIN_BAR = 1.5;

	const peak = $derived(Math.max(1, ...days.map((day) => day.value)));
	const step = $derived(days.length > 0 ? 100 / days.length : 100);
	const barWidth = $derived(step * 0.7);
	const isEmpty = $derived(days.every((day) => day.value === 0));
	const numberFormat = $derived(new Intl.NumberFormat(getLocale()));

	function barHeight(count: number): number {
		if (count === 0) {
			return 0;
		}
		return Math.max(MIN_BAR, (count / peak) * HEIGHT);
	}

	function dayLabel(day: string): string {
		return new Date(`${day}T00:00:00Z`).toLocaleDateString(getLocale(), {
			timeZone: "UTC",
			month: "short",
			day: "numeric",
		});
	}

	const first = $derived(days.at(0));
	const last = $derived(days.at(-1));
</script>

<figure class="flex min-w-0 flex-col gap-3">
	<figcaption class="flex flex-wrap items-baseline gap-x-2">
		<span class="text-2xl font-semibold tabular-nums">{numberFormat.format(summary)}</span>
		<span class="text-sm text-muted-foreground">
			{m.admin_chart_caption({ label, count: days.length })}
		</span>
	</figcaption>

	{#if isEmpty}
		<p
			class="rounded-lg border border-dashed border-foreground/15 px-3 py-6 text-center text-sm text-muted-foreground"
		>
			{emptyText}
		</p>
	{:else}
		<!-- Bars stretch with the card; heights stay in user units. -->
		<svg
			viewBox={`0 0 100 ${HEIGHT}`}
			preserveAspectRatio="none"
			role="img"
			aria-label={m.admin_chart_aria({ label, total: summary, count: days.length })}
			class="h-18 w-full overflow-visible"
		>
			{#each days as day, index (day.day)}
				{@const height = barHeight(day.value)}
				<g class="transition-opacity hover:opacity-70">
					<!-- Full-height hit target, so an empty or short day still answers. -->
					<rect
						x={index * step}
						y={0}
						width={step}
						height={HEIGHT}
						class="fill-transparent"
					>
						<title>{barTitle(day, dayLabel(day.day))}</title>
					</rect>
					{#if height > 0}
						<rect
							x={index * step}
							y={HEIGHT - height}
							width={barWidth}
							{height}
							rx={RADIUS}
							class="pointer-events-none fill-primary"
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
			<span>{first ? dayLabel(first.day) : ""}</span>
			<span>{last ? dayLabel(last.day) : ""}</span>
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
						<th scope="col" class="py-1 font-medium">{m.admin_chart_day()}</th>
						<th scope="col" class="py-1 text-right font-medium">{valueLabel}</th>
						{#if peopleLabel}
							<th scope="col" class="py-1 text-right font-medium">{peopleLabel}</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each days.filter((day) => day.value > 0) as day (day.day)}
						<tr class="border-t border-foreground/5">
							<td class="py-1">{dayLabel(day.day)}</td>
							<td class="py-1 text-right tabular-nums">{numberFormat.format(day.value)}</td>
							{#if peopleLabel}
								<td class="py-1 text-right tabular-nums">{numberFormat.format(day.people)}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</details>
	{/if}
</figure>
