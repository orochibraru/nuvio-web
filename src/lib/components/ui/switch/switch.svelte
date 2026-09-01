<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		size = "default",
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
		size?: "sm" | "default";
	} = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	data-size={size}
	class={cn(
		"peer group/switch relative inline-flex shrink-0 items-center rounded-full border transition-colors outline-none",
		"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
		"aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
		"data-disabled:cursor-not-allowed data-disabled:opacity-50",
		"data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7",
		"data-[state=checked]:border-primary data-[state=checked]:bg-primary",
		"data-[state=unchecked]:border-foreground/30 data-[state=unchecked]:bg-foreground/20",
		"after:absolute after:-inset-x-3 after:-inset-y-2",
		className,
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class={cn(
			"pointer-events-none block translate-x-0.5 rounded-full bg-white shadow ring-0 transition-transform",
			"group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
			"data-[state=checked]:translate-x-[calc(100%+2px)] data-[state=checked]:bg-primary-foreground",
		)}
	/>
</SwitchPrimitive.Root>
