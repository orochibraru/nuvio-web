<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import * as Card from "#lib/components/ui/card/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { theme } from "#lib/settings/theme.svelte.js";
  import {
    STREAM_QUALITIES,
    SUBTITLE_COLORS,
    type UiSettings,
    WATCH_REGIONS,
  } from "#lib/settings/ui-settings.js";
  import { cn } from "#lib/utils.js";

  let { update }: { update: (patch: Partial<UiSettings>) => Promise<void> } =
    $props();

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

  const qualityLabel = (q: string) => (q === "auto" ? "Auto (addon order)" : q);
  const regionLabel = (code: string) =>
    WATCH_REGIONS.find(([c]) => c === code)?.[1] ?? code;
  const languageLabel = (code: string) =>
    subtitleLanguages.find((l) => l.value === code)?.label ?? "Off";
</script>

<Card.Root class="border border-foreground/10">
  <Card.Header>
    <Card.Title>Playback</Card.Title>
    <Card.Description>How the player behaves for this profile.</Card.Description
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
          again : faster for debrid addons.
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
            {theme.current.linkCacheDays} day{theme.current.linkCacheDays === 1
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
          Debrid links expire : after this, the title resolves fresh.
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
