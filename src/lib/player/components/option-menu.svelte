<script lang="ts">
	import type { Snippet } from "svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { cn } from "#lib/utils.js";
	import Hint from "./hint.svelte";

	let {
		open,
		onOpenChange,
		label,
		options,
		value,
		onSelect,
		active = false,
		disabled = false,
		align = "end",
		children,
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		/** Names the button and heads the menu. */
		label: string;
		options: Array<{ value: string; label: string }>;
		value: string;
		onSelect: (value: string) => void;
		/** Something other than the default is picked : tint the icon. */
		active?: boolean;
		disabled?: boolean;
		align?: "start" | "end";
		/** The button's icon. */
		children: Snippet;
	} = $props();
</script>

<!-- One player setting : an icon button and the menu it opens. The menu wears
     the control bar's glass and floats clear of it, and is `dark` because it
     portals out of the player. -->
<DropdownMenu.Root {open} {onOpenChange}>
  <Hint {label}>
    {#snippet child({ props: hintProps })}
      <DropdownMenu.Trigger {...hintProps}>
        {#snippet child({ props })}
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            class={cn(
              "rounded-full hover:bg-white/15 hover:text-white dark:hover:bg-white/15 [&_svg]:size-5",
              active && "text-primary",
            )}
            {...props}
          >
            {@render children()}
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
    {/snippet}
  </Hint>
  <DropdownMenu.Content
    {align}
    side="top"
    sideOffset={52}
    class="dark max-h-[70vh] w-48 overflow-y-auto rounded-2xl bg-transparent bg-linear-to-b from-white/12 to-black/55 p-1.5 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_24px_60px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/10 backdrop-blur-2xl backdrop-saturate-150 scrollbar-thin"
  >
    <DropdownMenu.Group>
      <DropdownMenu.GroupHeading class="text-xs font-medium text-white/50">
        {label}
      </DropdownMenu.GroupHeading>
      <DropdownMenu.RadioGroup {value} onValueChange={onSelect}>
        {#each options as option (option.value)}
          <DropdownMenu.RadioItem
            value={option.value}
            {disabled}
            class="rounded-lg focus:bg-white/15 focus:text-white"
          >
            <span class="truncate">{option.label}</span>
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Group>
  </DropdownMenu.Content>
</DropdownMenu.Root>
