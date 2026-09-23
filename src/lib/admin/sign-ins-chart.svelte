<script lang="ts">
	import type { SignInDay } from "#lib/admin/admin-data.js";
	import { getLocale, m } from "#lib/i18n/index.js";

	let {
		days,
		label = m.admin_chart_label(),
	}: { days: SignInDay[]; label?: string } = $props();

	// Geometry in user units; the SVG scales to its container. One series, so
	// there is no legend : the heading names it.
	const HEIGHT = 72;
	const GAP = 2;
	const RADIUS = 2;
	const MIN_BAR = 1.5;

	const total = $derived(days.reduce((sum, day) => sum + day.signIns, 0));
	const peak = $derived(Math.max(1, ...days.map((day) => day.signIns)));
	const step = $derived(days.length > 0 ? 100 / days.length : 100);
	const barWidth = $derived(Math.max(1, step - GAP));

	/** Bars are anchored to the baseline, so a zero day draws nothing at all. */
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

<figure class="flex flex-col gap-3">
	<figcaption class="flex items-baseline gap-2">
		<span class="text-2xl font-semibold tabular-nums">{total}</span>
		<span class="text-sm text-muted-foreground">
			{m.admin_chart_caption({ label, count: days.length })}
		</span>
	</figcaption>

	{#if total === 0}
		<p
			class="rounded-lg border border-dashed border-foreground/15 px-3 py-6 text-center text-sm text-muted-foreground"
		>
			{m.admin_chart_empty()}
		</p>
	{:else}
		<!-- `preserveAspectRatio="none"` lets the bars stretch to the card's
		     width while their heights stay in user units, so the shape is the
		     same at every container size. -->
		<svg
			viewBox={`0 0 100 ${HEIGHT}`}
			preserveAspectRatio="none"
			role="img"
			aria-label={m.admin_chart_aria({ label, total, count: days.length })}
			class="h-18 w-full overflow-visible"
		>
			{#each days as day, index (day.day)}
				{@const height = barHeight(day.signIns)}
				{#if height > 0}
					<rect
						x={index * step}
						y={HEIGHT - height}
						width={barWidth}
						height={height}
						rx={RADIUS}
						class="fill-primary"
					>
						<title
							>{m.admin_chart_bar({
								day: dayLabel(day.day),
								signIns: day.signIns,
								people: day.people,
							})}</title
						>
					</rect>
				{:else}
					<!-- A zero day still needs a hit target, or hovering the gap
					     between two bars says nothing. -->
					<rect
						x={index * step}
						y={0}
						width={barWidth}
						height={HEIGHT}
						class="fill-transparent"
					>
						<title>{m.admin_chart_day_empty({ day: dayLabel(day.day) })}</title>
					</rect>
				{/if}
			{/each}
			<!-- Recessive baseline, drawn last so bars sit on it. -->
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

		<!-- Only the ends are labelled: a date under every bar is unreadable at
		     30 days and adds nothing the tooltips do not say. -->
		<div class="flex justify-between text-xs text-muted-foreground">
			<span>{first ? dayLabel(first.day) : ""}</span>
			<span>{last ? dayLabel(last.day) : ""}</span>
		</div>

		<!-- The table view: identity and values without relying on the chart. -->
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
						<th scope="col" class="py-1 text-right font-medium">{m.admin_sign_ins()}</th>
						<th scope="col" class="py-1 text-right font-medium">{m.admin_chart_people()}</th>
					</tr>
				</thead>
				<tbody>
					{#each days.filter((day) => day.signIns > 0) as day (day.day)}
						<tr class="border-t border-foreground/5">
							<td class="py-1">{dayLabel(day.day)}</td>
							<td class="py-1 text-right tabular-nums">{day.signIns}</td>
							<td class="py-1 text-right tabular-nums">{day.people}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</details>
	{/if}
</figure>
