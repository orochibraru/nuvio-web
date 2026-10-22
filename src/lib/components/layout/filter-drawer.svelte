<script lang="ts">
	import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Drawer from "#lib/components/ui/drawer/index.js";
	import { m } from "#lib/i18n/index.js";
	import { cn } from "#lib/utils.js";

	let {
		open = $bindable(false),
		active = 0,
		nested = false,
		trigger = "button",
		children,
	}: {
		open?: boolean;
		/** How many filters are off their default : the trigger's badge. */
		active?: number;
		/** Inside another drawer (the stream sheet): stacks on it. */
		nested?: boolean;
		/** `icon` for a round icon-only trigger, `none` when the caller has its own. */
		trigger?: "button" | "icon" | "none";
		/** The filter groups (`ChoiceList`s). */
		children: Snippet;
	} = $props();

	// Every filter sheet in the app: a bottom sheet on a phone, a panel from
	// the right on a desktop, and stacked when it opens from inside a sheet.
	const phone = new MediaQuery("max-width: 47.99rem");
	const Root = $derived(nested ? Drawer.NestedRoot : Drawer.Root);
</script>

<Root bind:open direction={nested || phone.current ? "bottom" : "right"}>
  {#if trigger !== "none"}
    <Drawer.Trigger
      aria-label={trigger === "icon" ? m.watch_filters() : undefined}
      class={cn(
        "relative flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-foreground/5 text-sm font-medium transition hover:bg-foreground/10",
        trigger === "icon" ? "size-12" : "px-3.5 py-2",
      )}
    >
      <SlidersHorizontalIcon class={trigger === "icon" ? "size-5" : "size-4"} />
      {#if trigger === "button"}
        {m.watch_filters()}
      {/if}
      {#if active > 0}
        <span
          class={cn(
            "flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground",
            trigger === "icon" && "absolute -top-0.5 -right-0.5",
          )}
        >
          {active}
        </span>
      {/if}
    </Drawer.Trigger>
  {/if}
  <Drawer.Content
    class="data-[vaul-drawer-direction=bottom]:max-h-[85dvh] md:max-w-sm"
  >
    <Drawer.Header class="md:flex-row md:items-center md:justify-between">
      <Drawer.Title>{m.watch_filters()}</Drawer.Title>
      <!-- A phone swipes the sheet away; a desktop gets a close button. -->
      <Drawer.Close
        aria-label={m.common_close()}
        class="hidden size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground md:flex"
      >
        <XIcon class="size-4" />
      </Drawer.Close>
    </Drawer.Header>
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
      {@render children()}
      <Button class="mt-2 h-12 w-full shrink-0 rounded-full" onclick={() => (open = false)}>
        {m.common_done()}
      </Button>
    </div>
  </Drawer.Content>
</Root>
