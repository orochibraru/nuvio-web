<script lang="ts">
	import ArrowDownRightIcon from "@lucide/svelte/icons/arrow-down-right";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import ArrowUpRightIcon from "@lucide/svelte/icons/arrow-up-right";
	import type { Comparison } from "#lib/admin/stats-data.js";
	import { getLocale, m } from "#lib/i18n/index.js";

	let {
		label,
		value,
		comparison,
		period,
		detail,
	}: {
		label: string;
		value: number;
		comparison?: Comparison;
		period?: string;
		detail?: string;
	} = $props();

	const compact = $derived(
		new Intl.NumberFormat(getLocale(), {
			notation: "compact",
			maximumFractionDigits: 1,
		}),
	);
	const signed = $derived(
		new Intl.NumberFormat(getLocale(), {
			signDisplay: "exceptZero",
			maximumFractionDigits: 1,
		}),
	);
	const signedPercent = $derived(
		new Intl.NumberFormat(getLocale(), {
			style: "percent",
			signDisplay: "exceptZero",
			maximumFractionDigits: 0,
		}),
	);

	const difference = $derived(
		comparison ? comparison.current - comparison.previous : 0,
	);
	const change = $derived.by(() => {
		if (!comparison) {
			return "";
		}
		if (comparison.previous === 0) {
			return signed.format(difference);
		}
		return signedPercent.format(difference / comparison.previous);
	});
</script>

<div class="flex min-w-0 flex-col gap-1 rounded-xl border border-foreground/10 bg-card p-4">
	<span class="text-sm text-muted-foreground">{label}</span>
	<span class="text-3xl font-semibold tracking-tight">{compact.format(value)}</span>
	{#if comparison && period}
		<span class="flex items-center gap-1 text-xs text-muted-foreground">
			{#if difference > 0}
				<ArrowUpRightIcon class="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
			{:else if difference < 0}
				<ArrowDownRightIcon class="size-3.5 text-rose-600 dark:text-rose-400" aria-hidden="true" />
			{:else}
				<ArrowRightIcon class="size-3.5" aria-hidden="true" />
			{/if}
			{difference === 0
				? m.admin_stat_unchanged({ period })
				: m.admin_stat_delta({ change, period })}
		</span>
	{:else if detail}
		<span class="text-xs text-muted-foreground">{detail}</span>
	{/if}
</div>
