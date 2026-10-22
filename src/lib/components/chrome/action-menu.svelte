<script lang="ts" module>
	import type { Component, Snippet } from "svelte";

	export interface MenuAction {
		label: string;
		icon: Component;
		onSelect: () => void;
		disabled?: boolean;
		/** Draw a divider above this action. */
		separator?: boolean;
	}
</script>

<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";
	import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
	import * as Drawer from "#lib/components/ui/drawer/index.js";

	let {
		title,
		actions,
		contentClass = "w-52",
		children,
	}: {
		/** Heads the phone's sheet: what the actions apply to. */
		title: string;
		actions: MenuAction[];
		contentClass?: string;
		children: Snippet;
	} = $props();

	// A right-click menu on desktop; on a phone a long press opens the same
	// actions in a bottom sheet, like an app. The menu stays mounted (only
	// disabled) so switching never remounts what it wraps.
	const phone = new MediaQuery("max-width: 47.99rem");
	let sheetOpen = $state(false);

	// iOS never fires `contextmenu` on a long press, so time it here; Android
	// fires it too, and both just open the sheet. The tap that ends a long
	// press must not also follow the link underneath.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let longPressed = false;

	function cancel() {
		clearTimeout(timer);
		timer = undefined;
	}

	function open() {
		cancel();
		longPressed = true;
		sheetOpen = true;
	}

	function onpointerdown(event: PointerEvent) {
		longPressed = false;
		if (!phone.current || event.pointerType === "mouse") {
			return;
		}
		cancel();
		timer = setTimeout(open, 500);
	}

	function oncontextmenu(event: MouseEvent) {
		if (!phone.current) {
			return;
		}
		event.preventDefault();
		open();
	}

	function onclickcapture(event: MouseEvent) {
		if (longPressed) {
			event.preventDefault();
			event.stopPropagation();
			longPressed = false;
		}
	}

	function select(action: MenuAction) {
		sheetOpen = false;
		action.onSelect();
	}
</script>

<div
  class="contents [-webkit-touch-callout:none]"
  role="presentation"
  {onpointerdown}
  onpointermove={cancel}
  onpointerup={cancel}
  onpointercancel={cancel}
  {oncontextmenu}
  {onclickcapture}
>
  <ContextMenu.Root>
    <ContextMenu.Trigger class="contents" disabled={phone.current}>
      {@render children()}
    </ContextMenu.Trigger>
    <ContextMenu.Content class={contentClass}>
      {#each actions as action (action.label)}
        {#if action.separator}
          <ContextMenu.Separator />
        {/if}
        <ContextMenu.Item disabled={action.disabled} onSelect={action.onSelect}>
          <action.icon />
          {action.label}
        </ContextMenu.Item>
      {/each}
    </ContextMenu.Content>
  </ContextMenu.Root>
</div>

{#if phone.current}
  <Drawer.Root bind:open={sheetOpen}>
    <Drawer.Content>
      <Drawer.Header>
        <Drawer.Title class="truncate">{title}</Drawer.Title>
      </Drawer.Header>
      <div class="px-4 pb-4">
        <div
          class="glass flex flex-col divide-y divide-foreground/8 overflow-hidden rounded-3xl"
        >
          {#each actions as action (action.label)}
            <button
              type="button"
              disabled={action.disabled}
              onclick={() => select(action)}
              class="flex items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors active:bg-foreground/5 disabled:opacity-50"
            >
              <span
                class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
              >
                <action.icon class="size-4" />
              </span>
              {action.label}
            </button>
          {/each}
        </div>
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
