<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import { toast } from "svelte-sonner";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { saveUiSettings } from "$lib/settings/settings.remote";
	import { theme } from "$lib/settings/theme.svelte";
	import {
		type Accent,
		STREAM_QUALITIES,
		type UiSettings,
	} from "$lib/settings/ui-settings.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { cn } from "$lib/utils.js";

	pageTitle.set("Settings");

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

	const subtitleSizes: Array<{
		value: UiSettings["subtitleSize"];
		label: string;
	}> = [
		{ value: "small", label: "Small" },
		{ value: "medium", label: "Medium" },
		{ value: "large", label: "Large" },
	];

	const subtitleColors = [
		"#ffffff",
		"#facc15",
		"#22d3ee",
		"#a3e635",
		"#f472b6",
	];

	const subtitleLanguages: Array<{ value: string; label: string }> = [
		{ value: "", label: "Off" },
		{ value: "eng", label: "English" },
		{ value: "spa", label: "Spanish" },
		{ value: "fre", label: "French" },
		{ value: "ger", label: "German" },
		{ value: "por", label: "Portuguese" },
		{ value: "ita", label: "Italian" },
		{ value: "dut", label: "Dutch" },
		{ value: "rus", label: "Russian" },
		{ value: "jpn", label: "Japanese" },
		{ value: "kor", label: "Korean" },
		{ value: "chi", label: "Chinese" },
		{ value: "ara", label: "Arabic" },
	];

	const syncSources: Array<{
		value: UiSettings["librarySource"];
		label: string;
		ready: boolean;
	}> = [
		{ value: "nuvio", label: "Nuvio Sync", ready: true },
		{ value: "trakt", label: "Trakt", ready: false },
		{ value: "simkl", label: "SIMKL", ready: false },
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
	<h1 class="text-3xl font-bold tracking-tight">Settings</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Appearance</Card.Title>
			<Card.Description>Stored on your Nuvio account, per profile.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-7">
			<div class="flex flex-col gap-2.5">
				<span class="text-sm font-medium">Mode</span>
				<div class="flex w-fit gap-1 rounded-full bg-foreground/5 p-1">
					{#each modes as option (option.value)}
						<button
							type="button"
							onclick={() => update({ mode: option.value })}
							class={cn(
								"rounded-full px-4 py-1.5 text-sm font-medium transition",
								theme.current.mode === option.value
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-2.5">
				<span class="text-sm font-medium">Dark style</span>
				<div class="grid grid-cols-2 gap-2 sm:max-w-xs">
					{#each darkStyles as option (option.value)}
						<button
							type="button"
							onclick={() => update({ darkStyle: option.value })}
							class={cn(
								"flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-2.5 text-sm transition",
								theme.current.darkStyle === option.value
									? "border-primary/50 bg-primary/5"
									: "border-border/60 hover:border-border",
							)}
						>
							<span class="font-semibold">{option.label}</span>
							<span class="text-xs text-muted-foreground">{option.hint}</span>
						</button>
					{/each}
				</div>
				<p class="text-xs text-muted-foreground">Applies when the effective mode is dark.</p>
			</div>

			<div class="flex flex-col gap-2.5">
				<span class="text-sm font-medium">Accent colour</span>
				<div class="flex flex-wrap gap-2.5">
					{#each accents as option (option.value)}
						<button
							type="button"
							aria-label={option.value}
							onclick={() => update({ accent: option.value })}
							class={cn(
								"flex size-10 items-center justify-center rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-background transition",
								theme.current.accent === option.value && "ring-ring",
							)}
							style={`background-color: ${option.swatch}`}
						>
							{#if theme.current.accent === option.value}
								<CheckIcon class="size-4 text-white drop-shadow" />
							{/if}
						</button>
					{/each}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Playback</Card.Title>
			<Card.Description>How the player behaves for this profile.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-7">
			<label class="flex items-center justify-between gap-4">
				<span class="flex flex-col gap-0.5">
					<span class="text-sm font-medium">Autoplay next episode</span>
					<span class="text-xs text-muted-foreground">
						Start the next episode automatically after one finishes.
					</span>
				</span>
				<Switch
					checked={theme.current.autoPlayNext}
					onCheckedChange={(value) => update({ autoPlayNext: value })}
				/>
			</label>

			<div class="flex flex-col gap-2.5">
				<span class="text-sm font-medium">Preferred quality</span>
				<select
					value={theme.current.preferredQuality}
					onchange={(event) =>
						update({
							preferredQuality: event.currentTarget
								.value as UiSettings["preferredQuality"],
						})}
					class="w-fit rounded-md border border-border bg-background px-3 py-1.5 text-sm"
				>
					{#each STREAM_QUALITIES as option (option)}
						<option value={option}>
							{option === "auto" ? "Auto (addon order)" : option}
						</option>
					{/each}
				</select>
				<span class="text-xs text-muted-foreground">
					The player auto-picks the closest match from a source list. You can
					still choose any source manually.
				</span>
			</div>

			<div class="flex flex-col gap-2.5">
				<span class="text-sm font-medium">Preferred subtitle language</span>
				<select
					value={theme.current.subtitleLanguage}
					onchange={(event) =>
						update({ subtitleLanguage: event.currentTarget.value })}
					class="w-fit rounded-md border border-border bg-background px-3 py-1.5 text-sm"
				>
					{#each subtitleLanguages as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
				<span class="text-xs text-muted-foreground">
					Turned on automatically when a stream offers a matching track.
				</span>
			</div>

			<div class="flex flex-col gap-2.5">
				<span class="text-sm font-medium">Subtitle size</span>
				<div class="flex w-fit gap-1 rounded-full bg-foreground/5 p-1">
					{#each subtitleSizes as option (option.value)}
						<button
							type="button"
							onclick={() => update({ subtitleSize: option.value })}
							class={cn(
								"rounded-full px-4 py-1.5 text-sm font-medium transition",
								theme.current.subtitleSize === option.value
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="flex flex-col gap-2.5">
				<span class="text-sm font-medium">Subtitle colour</span>
				<div class="flex flex-wrap gap-2.5">
					{#each subtitleColors as color (color)}
						<button
							type="button"
							aria-label={`Subtitle colour ${color}`}
							onclick={() => update({ subtitleColor: color })}
							class={cn(
								"flex size-9 items-center justify-center rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-background transition",
								theme.current.subtitleColor === color && "ring-ring",
							)}
							style={`background-color: ${color}`}
						>
							{#if theme.current.subtitleColor === color}
								<CheckIcon class="size-4 text-black/70" />
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<label class="flex items-center justify-between gap-4">
				<span class="flex flex-col gap-0.5">
					<span class="text-sm font-medium">Subtitle background</span>
					<span class="text-xs text-muted-foreground">
						A dark plate behind the text for readability.
					</span>
				</span>
				<Switch
					checked={theme.current.subtitleBackground}
					onCheckedChange={(value) => update({ subtitleBackground: value })}
				/>
			</label>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Sync</Card.Title>
			<Card.Description>
				Choose where your library and watch progress live. Trakt and SIMKL need
				to be connected first.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-7">
			{#each [{ key: "librarySource", label: "Library from" }, { key: "progressSource", label: "Watch progress from" }] as row (row.key)}
				<div class="flex flex-col gap-2.5">
					<span class="text-sm font-medium">{row.label}</span>
					<div class="flex w-fit flex-wrap gap-1 rounded-full bg-foreground/5 p-1">
						{#each syncSources as option (option.value)}
							<button
								type="button"
								disabled={!option.ready}
								onclick={() =>
									update({ [row.key]: option.value } as Partial<UiSettings>)}
								class={cn(
									"rounded-full px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
									theme.current[row.key as "librarySource" | "progressSource"] ===
										option.value
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground enabled:hover:text-foreground",
								)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>
			{/each}
			<p class="text-xs text-muted-foreground">
				Nuvio Sync is always the cross-device mirror. Trakt / SIMKL integration
				is coming.
			</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Addons</Card.Title>
			<Card.Description>
				Catalogs, metadata, streams and subtitles come from your installed addons.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button href="/addons" variant="outline">
				<PuzzleIcon data-icon="inline-start" /> Manage addons
			</Button>
		</Card.Content>
	</Card.Root>
</div>
