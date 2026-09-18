<script lang="ts">
	import StarIcon from "@lucide/svelte/icons/star";
	import { cn } from "#lib/utils.js";

	let {
		rating,
		size = "sm",
		label = false,
		variant = "inline",
		class: className,
	}: {
		/** IMDb score. Numbers are formatted to one decimal; nullish / empty
		 *  renders nothing. */
		rating: string | number | null | undefined;
		size?: "sm" | "md";
		/** Show the dimmed "IMDb" suffix. */
		label?: boolean;
		/** `inline` sits in a meta line; `badge` is the pill overlaid on a poster. */
		variant?: "inline" | "badge";
		class?: string;
	} = $props();

	const value = $derived(
		typeof rating === "number" ? rating.toFixed(1) : rating || null,
	);
</script>

{#if value}
	<span
		aria-hidden={variant === "badge" ? "true" : undefined}
		title="IMDb rating"
		class={cn(
			"flex items-center gap-1",
			variant === "badge" &&
				"rounded-md bg-black/55 px-1.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur-md",
			className,
		)}
	>
		<StarIcon
			class={cn(
				"fill-amber-400 text-amber-400",
				size === "md" ? "size-3.5" : "size-3",
			)}
		/>
		{value}
		{#if label}
			<!-- A colour token, not `opacity`: opacity compounds with the parent's
			     own fade, and in light mode that fell to 3.5:1. -->
			<span
				class={cn(
					"ml-0.5 text-[10px] font-semibold tracking-wide",
					variant === "badge" ? "text-white/70" : "text-muted-foreground",
				)}
			>
				IMDb
			</span>
		{/if}
	</span>
{/if}
