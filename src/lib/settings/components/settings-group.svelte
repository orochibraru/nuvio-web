<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "#lib/utils.js";

	let {
		title,
		headingId,
		footer,
		plain = false,
		action,
		children,
	}: {
		title: string;
		/** For a control that takes its accessible name from the heading. */
		headingId?: string;
		/** A note under the group. */
		footer?: string;
		/** Lay the children out bare instead of as rows in one panel. */
		plain?: boolean;
		action?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="flex flex-col gap-2">
  <div class="flex min-h-8 items-end justify-between gap-3 px-1">
    <h2
      id={headingId}
      class="text-xs font-semibold tracking-[0.12em] text-accent-label uppercase"
    >
      {title}
    </h2>
    {@render action?.()}
  </div>
  <div
    class={cn(
      plain
        ? "flex flex-col gap-3"
        : "glass flex flex-col divide-y divide-foreground/8 rounded-3xl",
    )}
  >
    {@render children()}
  </div>
  {#if footer}
    <p class="px-1 text-xs text-muted-foreground">{footer}</p>
  {/if}
</section>
