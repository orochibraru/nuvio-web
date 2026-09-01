<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import { toast } from "svelte-sonner";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Select from "#lib/components/ui/select/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { saveUiSettings } from "#lib/settings/settings.remote.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import {
		type Accent,
		STREAM_QUALITIES,
		SUBTITLE_COLORS,
		type UiSettings,
		WATCH_REGIONS,
	} from "#lib/settings/ui-settings.js";
	import { pageTitle } from "#lib/stores/title.svelte.js";
	import { cn } from "#lib/utils.js";
	import { refreshAll } from "$app/navigation";
	import { resolve } from "$app/paths";

	pageTitle.set("Settings");

	// "idle" → "saving" → "saved" (auto-clears); "error" reverts the preview.
	let saveState = $state<"idle" | "saving" | "saved" | "error">("idle");
	let savedTimer: ReturnType<typeof setTimeout> | undefined;

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

	// Swatch colour comes from `--primary` under each `[data-accent]` scope
	// (layout.css) — no second copy of the ramp to keep in sync.
	const accents: Array<{ value: Accent }> = [
		{ value: "blue" },
		{ value: "violet" },
		{ value: "green" },
		{ value: "rose" },
		{ value: "amber" },
		{ value: "cyan" },
		{ value: "neutral" },
	];

	const subtitleSizes: Array<{
		value: UiSettings["subtitleSize"];
		label: string;
	}> = [
		{ value: "small", label: "Small" },
		{ value: "medium", label: "Medium" },
		{ value: "large", label: "Large" },
	];

	const subtitleColors = SUBTITLE_COLORS;

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

	function setSyncSource(
		key: "librarySource" | "progressSource",
		value: UiSettings["librarySource"],
	) {
		void update(
			key === "librarySource"
				? { librarySource: value }
				: { progressSource: value },
		);
	}

	const qualityLabel = (q: string) => (q === "auto" ? "Auto (addon order)" : q);
	const regionLabel = (code: string) =>
		WATCH_REGIONS.find(([c]) => c === code)?.[1] ?? code;
	const languageLabel = (code: string) =>
		subtitleLanguages.find((l) => l.value === code)?.label ?? "Off";

	async function update(patch: Partial<UiSettings>) {
		const previous = { ...theme.current };
		const next = { ...previous, ...patch };
		theme.preview(next);
		saveState = "saving";
		clearTimeout(savedTimer);
		try {
			await saveUiSettings(next);
			saveState = "saved";
			await refreshAll();
			savedTimer = setTimeout(() => {
				if (saveState === "saved") {
					saveState = "idle";
				}
			}, 2000);
		} catch {
			theme.preview(previous); // roll the optimistic change back
			saveState = "error";
			toast.error("Couldn't save — reverted.");
		}
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6">
  <div class="flex items-center gap-3">
    <h1 class="text-3xl font-bold tracking-tight">Settings</h1>
    {#if saveState === "saving"}
      <span class="text-xs text-muted-foreground">Saving…</span>
    {:else if saveState === "saved"}
      <span class="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckIcon class="size-3.5" /> Saved
      </span>
    {/if}
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Appearance</Card.Title>
      <Card.Description
        >Stored on your Nuvio account, per profile.</Card.Description
      >
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
                  ? "bg-primary text-primary-foreground shadow-sm"
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
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border/60 hover:border-border",
              )}
            >
              <span class="font-semibold">{option.label}</span>
              <span class="text-xs text-muted-foreground">{option.hint}</span>
            </button>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground">
          Applies when the effective mode is dark.
        </p>
      </div>

      <div class="flex flex-col gap-2.5">
        <span class="text-sm font-medium">Accent colour</span>
        <div class="flex flex-wrap gap-3">
          {#each accents as option (option.value)}
            <button
              type="button"
              aria-label={option.value}
              aria-pressed={theme.current.accent === option.value}
              data-accent={option.value === "neutral"
                ? undefined
                : option.value}
              onclick={() => update({ accent: option.value })}
              class={cn(
                "flex size-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-card transition",
                option.value === "neutral" ? "bg-neutral-500" : "bg-primary",
                theme.current.accent === option.value
                  ? "ring-foreground"
                  : "ring-transparent",
              )}
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

  <Card.Root>
    <Card.Header>
      <Card.Title>Playback</Card.Title>
      <Card.Description
        >How the player behaves for this profile.</Card.Description
      >
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

      <label class="flex items-center justify-between gap-4">
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-medium">Reuse the last stream link</span>
          <span class="text-xs text-muted-foreground">
            Re-open a title straight to its previous link instead of resolving
            again — faster for debrid addons.
          </span>
        </span>
        <Switch
          checked={theme.current.reuseLastLink}
          onCheckedChange={(value) => update({ reuseLastLink: value })}
        />
      </label>

      {#if theme.current.reuseLastLink}
        <div class="flex flex-col gap-2.5">
          <span class="text-sm font-medium" id="link-cache-label">
            Keep a remembered link for
          </span>
          <Select.Root
            type="single"
            value={String(theme.current.linkCacheDays)}
            onValueChange={(v) => update({ linkCacheDays: Number(v) })}
          >
            <Select.Trigger aria-labelledby="link-cache-label" class="w-64">
              {theme.current.linkCacheDays} day{theme.current.linkCacheDays ===
              1
                ? ""
                : "s"}
            </Select.Trigger>
            <Select.Content>
              {#each [1, 2, 3, 5, 7, 14, 30] as days (days)}
                <Select.Item value={String(days)} label={`${days} days`}>
                  {days} day{days === 1 ? "" : "s"}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <span class="text-xs text-muted-foreground">
            Debrid links expire — after this, the title resolves fresh.
          </span>
        </div>
      {/if}

      <div class="flex flex-col gap-2.5">
        <span class="text-sm font-medium" id="pref-quality-label"
          >Preferred quality</span
        >
        <Select.Root
          type="single"
          value={theme.current.preferredQuality}
          onValueChange={(v) =>
            update({ preferredQuality: v as UiSettings["preferredQuality"] })}
        >
          <Select.Trigger aria-labelledby="pref-quality-label" class="w-64">
            {qualityLabel(theme.current.preferredQuality)}
          </Select.Trigger>
          <Select.Content>
            {#each STREAM_QUALITIES as option (option)}
              <Select.Item value={option} label={qualityLabel(option)}>
                {qualityLabel(option)}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <span class="text-xs text-muted-foreground">
          The player auto-picks the closest match from a source list. You can
          still choose any source manually.
        </span>
      </div>

      <div class="flex flex-col gap-2.5">
        <span class="text-sm font-medium" id="watch-region-label"
          >Where to watch region</span
        >
        <Select.Root
          type="single"
          value={theme.current.watchRegion}
          onValueChange={(v) =>
            update({ watchRegion: v as UiSettings["watchRegion"] })}
        >
          <Select.Trigger aria-labelledby="watch-region-label" class="w-64">
            {regionLabel(theme.current.watchRegion)}
          </Select.Trigger>
          <Select.Content>
            {#each WATCH_REGIONS as [code, label] (code)}
              <Select.Item value={code} {label}>{label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <span class="text-xs text-muted-foreground">
          Which country's streaming services the "Available on" list and the
          official-source Watch button use.
        </span>
      </div>

      <div class="flex flex-col gap-2.5">
        <span class="text-sm font-medium" id="sub-lang-label"
          >Preferred subtitle language</span
        >
        <Select.Root
          type="single"
          value={theme.current.subtitleLanguage}
          onValueChange={(v) => update({ subtitleLanguage: v })}
        >
          <Select.Trigger aria-labelledby="sub-lang-label" class="w-64">
            {languageLabel(theme.current.subtitleLanguage)}
          </Select.Trigger>
          <Select.Content>
            {#each subtitleLanguages as option (option.value)}
              <Select.Item value={option.value} label={option.label}>
                {option.label}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
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
                  ? "bg-primary text-primary-foreground shadow-sm"
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
              aria-pressed={theme.current.subtitleColor === color}
              onclick={() => update({ subtitleColor: color })}
              class={cn(
                "flex size-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-card transition",
                theme.current.subtitleColor === color
                  ? "ring-foreground"
                  : "ring-transparent",
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
      {#each [{ key: "librarySource", label: "Library from" }, { key: "progressSource", label: "Watch progress from" }] as const as row (row.key)}
        <div class="flex flex-col gap-2.5">
          <span class="text-sm font-medium">{row.label}</span>
          <div
            class="flex w-fit flex-wrap gap-1 rounded-full bg-foreground/5 p-1"
          >
            {#each syncSources as option (option.value)}
              <button
                type="button"
                disabled={!option.ready}
                title={option.ready
                  ? undefined
                  : `Connect ${option.label} in the Nuvio app first`}
                onclick={() => setSyncSource(row.key, option.value)}
                class={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                  theme.current[
                    row.key as "librarySource" | "progressSource"
                  ] === option.value
                    ? "bg-primary text-primary-foreground shadow-sm"
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
        Catalogs, metadata, streams and subtitles come from your installed
        addons.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <Button href={resolve("addons")} variant="outline">
        <PuzzleIcon data-icon="inline-start" />
        Manage addons
      </Button>
    </Card.Content>
  </Card.Root>
</div>
