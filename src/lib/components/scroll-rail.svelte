<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import type { Snippet } from "svelte";
	import { prefersReducedMotion } from "#lib/motion.js";
	import { cn } from "#lib/utils.js";

	let {
		label,
		class: className,
		trackClass,
		arrows = true,
		arrowTop = "top-1/2",
		resetKey,
		children,
	}: {
		/** Accessible name for the scroll group and the nudge buttons. */
		label: string;
		class?: string;
		/** Extra classes on the scrollable track (gap, snap, padding…). */
		trackClass?: string;
		arrows?: boolean;
		arrowTop?: string;
		/** Scrolls the track back to the start whenever this value changes. */
		resetKey?: unknown;
		children: Snippet;
	} = $props();

	let track = $state<HTMLDivElement | null>(null);
	let atStart = $state(true);
	let atEnd = $state(false);

	function sync() {
		if (!track) {
			return;
		}
		atStart = track.scrollLeft <= 8;
		atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
	}

	function nudge(direction: 1 | -1) {
		if (!track) {
			return;
		}
		track.scrollBy({
			left: direction * track.clientWidth * 0.8,
			behavior: "smooth",
		});
	}

	// Explicit opt-in: snap back to the start when the caller's `resetKey`
	// changes (a season/catalog switch) : never on an incidental re-render of
	// the same row (`items` getting a fresh array reference on every sync
	// tick must not fight the viewer's own scroll position).
	$effect(() => {
		void resetKey;
		if (track) {
			track.scrollLeft = 0;
		}
	});

	// Roving tabindex: one item per row is a Tab stop (arrow keys move it),
	// so Tab past a long row costs one stop instead of one per card.
	const FOCUSABLE =
		'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
	let activeIndex = $state(0);

	function rowItems(): HTMLElement[] {
		return track
			? [...track.children].filter(
					(el): el is HTMLElement => el instanceof HTMLElement,
				)
			: [];
	}

	function focusablesIn(item: HTMLElement): HTMLElement[] {
		return [...item.querySelectorAll<HTMLElement>(FOCUSABLE)];
	}

	function applyRoving() {
		const items = rowItems();
		if (items.length === 0) {
			return;
		}
		if (activeIndex >= items.length) {
			activeIndex = items.length - 1;
		}
		items.forEach((item, index) => {
			for (const el of focusablesIn(item)) {
				el.tabIndex = index === activeIndex ? 0 : -1;
			}
		});
	}

	// Re-run whenever the track's items change : a season/catalog switch, a
	// "load more" append, a sync re-publish that swaps in equal-but-new poster
	// objects : not just on the caller-supplied `resetKey`. Recomputes both
	// the edge fade (item count can change the scrollable width) and roving
	// tabindex, without ever touching scroll position.
	$effect(() => {
		if (!track) {
			return;
		}
		sync();
		applyRoving();
		const observer = new MutationObserver(() => {
			sync();
			applyRoving();
		});
		observer.observe(track, { childList: true });
		return () => observer.disconnect();
	});

	function onFocusIn(event: FocusEvent) {
		const items = rowItems();
		const index = items.findIndex((item) =>
			item.contains(event.target as Node),
		);
		if (index !== -1 && index !== activeIndex) {
			activeIndex = index;
			applyRoving();
		}
	}

	function onTrackKeydown(event: KeyboardEvent) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}
		const items = rowItems();
		const from = items.findIndex((item) =>
			item.contains(document.activeElement),
		);
		if (from === -1) {
			return;
		}
		const to =
			event.key === "ArrowRight"
				? Math.min(items.length - 1, from + 1)
				: Math.max(0, from - 1);
		if (to === from) {
			return;
		}
		event.preventDefault();
		activeIndex = to;
		applyRoving();
		const target = focusablesIn(items[to])[0];
		target?.focus();
		target?.scrollIntoView({
			behavior: prefersReducedMotion() ? "auto" : "smooth",
			inline: "nearest",
			block: "nearest",
		});
	}
</script>

<div class={cn("group/row relative -mx-2", className)}>
  <!-- Roving-tabindex composite: the group itself owns arrow-key nav across
	     its cards, standard for this WAI-ARIA APG pattern. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={track}
    role="group"
    aria-label={label}
    onscroll={sync}
    onkeydown={onTrackKeydown}
    onfocusin={onFocusIn}
    class={cn(
      "no-scrollbar flex overflow-x-auto scroll-smooth px-2",
      trackClass,
    )}
  >
    {@render children()}
  </div>

  <div
    class={cn(
      "pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-background to-transparent transition-opacity duration-200",
      atStart && "opacity-0",
    )}
  ></div>
  <div
    class={cn(
      "pointer-events-none absolute inset-y-0 right-0 w-16 bg-linear-to-l from-background to-transparent transition-opacity duration-200",
      atEnd && "opacity-0",
    )}
  ></div>

  {#if arrows}
    <button
      type="button"
      aria-label={`Scroll ${label} left`}
      disabled={atStart}
      onclick={() => nudge(-1)}
      class={cn(
        "absolute left-1 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 ring-1 ring-border backdrop-blur-md transition-opacity duration-200 group-hover/row:opacity-100 hover:bg-background focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-0! sm:flex",
        arrowTop,
      )}
    >
      <ChevronLeftIcon class="size-5" />
    </button>
    <button
      type="button"
      aria-label={`Scroll ${label} right`}
      disabled={atEnd}
      onclick={() => nudge(1)}
      class={cn(
        "absolute right-1 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 ring-1 ring-border backdrop-blur-md transition-opacity duration-200 group-hover/row:opacity-100 hover:bg-background focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-0! sm:flex",
        arrowTop,
      )}
    >
      <ChevronRightIcon class="size-5" />
    </button>
  {/if}
</div>
