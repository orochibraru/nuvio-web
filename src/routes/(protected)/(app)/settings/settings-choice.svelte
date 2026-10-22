<script lang="ts" generics="Value extends string">
	import { cn } from "#lib/utils.js";

	let {
		options,
		value,
		onSelect,
		labelledby,
	}: {
		options: Array<{
			value: Value;
			label: string;
			disabled?: boolean;
			title?: string;
			lang?: string;
		}>;
		value: Value;
		onSelect: (value: Value) => void;
		labelledby?: string;
	} = $props();
</script>

<div
  role="group"
  aria-labelledby={labelledby}
  class="grid w-full auto-cols-fr grid-flow-col gap-1 rounded-full bg-foreground/5 p-1"
>
  {#each options as option (option.value)}
    <button
      type="button"
      lang={option.lang}
      disabled={option.disabled}
      title={option.title}
      aria-pressed={value === option.value}
      onclick={() => onSelect(option.value)}
      class={cn(
        "truncate rounded-full px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        value === option.value
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground enabled:hover:text-foreground",
      )}
    >
      {option.label}
    </button>
  {/each}
</div>
