<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { toast } from "svelte-sonner";
	import * as Card from "$lib/components/ui/card/index.js";
	import { saveUiSettings } from "$lib/settings/settings.remote";
	import { theme } from "$lib/settings/theme.svelte";
	import type { Accent, UiSettings } from "$lib/settings/ui-settings.js";
	import { cn } from "$lib/utils.js";

	const modes: Array<{ value: UiSettings["mode"]; label: string }> = [
		{ value: "system", label: "System" },
		{ value: "light", label: "Light" },
		{ value: "dark", label: "Dark" },
	];

	const darkStyles: Array<{
		value: UiSettings["darkStyle"];
		label: string;
		hint: string;
	}> = [
		{ value: "dim", label: "Dim", hint: "Soft dark grey" },
		{ value: "amoled", label: "AMOLED", hint: "Pure black" },
	];

	const accents: Array<{ value: Accent; swatch: string }> = [
		{ value: "blue", swatch: "oklch(0.55 0.2 255)" },
		{ value: "violet", swatch: "oklch(0.54 0.22 293)" },
		{ value: "green", swatch: "oklch(0.6 0.15 155)" },
		{ value: "rose", swatch: "oklch(0.58 0.22 12)" },
		{ value: "amber", swatch: "oklch(0.75 0.15 75)" },
		{ value: "cyan", swatch: "oklch(0.62 0.12 210)" },
		{ value: "neutral", swatch: "oklch(0.55 0 0)" },
	];

	async function update(patch: Partial<UiSettings>) {
		const next = { ...theme.current, ...patch };
		theme.preview(next);
		try {
			await saveUiSettings(next);
		} catch {
			toast.error("Couldn't save your theme.");
		}
	}
</script>

<div class="flex max-w-2xl flex-col gap-6">
	<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Appearance</Card.Title>
			<Card.Description>Stored on your Nuvio account, per profile.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-6">
			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium">Mode</span>
				<div class="flex gap-2">
					{#each modes as option (option.value)}
						<button
							type="button"
							onclick={() => update({ mode: option.value })}
							class={cn(
								"rounded-md border px-3 py-1.5 text-sm transition",
								theme.current.mode === option.value
									? "border-foreground bg-foreground text-background"
									: "border-border text-muted-foreground hover:text-foreground",
							)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium">Dark style</span>
				<div class="flex gap-2">
					{#each darkStyles as option (option.value)}
						<button
							type="button"
							onclick={() => update({ darkStyle: option.value })}
							class={cn(
								"flex flex-col items-start rounded-md border px-3 py-2 text-sm transition",
								theme.current.darkStyle === option.value
									? "border-foreground"
									: "border-border hover:border-foreground/40",
							)}
						>
							<span class="font-medium">{option.label}</span>
							<span class="text-xs text-muted-foreground">{option.hint}</span>
						</button>
					{/each}
				</div>
				<p class="text-xs text-muted-foreground">Applies when the effective mode is dark.</p>
			</div>

			<div class="flex flex-col gap-2">
				<span class="text-sm font-medium">Accent colour</span>
				<div class="flex flex-wrap gap-2">
					{#each accents as option (option.value)}
						<button
							type="button"
							aria-label={option.value}
							onclick={() => update({ accent: option.value })}
							class={cn(
								"flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition",
								theme.current.accent === option.value && "ring-2 ring-ring",
							)}
							style={`background-color: ${option.swatch}`}
						>
							{#if theme.current.accent === option.value}
								<CheckIcon class="size-4 text-white" />
							{/if}
						</button>
					{/each}
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>
