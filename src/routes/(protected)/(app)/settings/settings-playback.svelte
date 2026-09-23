<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Select from "#lib/components/ui/select/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { getLocale, m } from "#lib/i18n/index.js";
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
		{ value: "small", label: m.subtitle_size_small() },
		{ value: "medium", label: m.subtitle_size_medium() },
		{ value: "large", label: m.subtitle_size_large() },
	];

	const subtitleColors = SUBTITLE_COLORS;

	// Stored as ISO 639-2 codes, named in the viewer's locale by `Intl` (from
	// the matching ISO 639-1 code). Capitalised: fr / es name them lowercase.
	const locale = getLocale();
	const languageNames = new Intl.DisplayNames([locale], { type: "language" });
	const regionNames = new Intl.DisplayNames([locale], { type: "region" });
	const capitalise = (text: string) =>
		text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
	const subtitleLanguages: Array<{ value: string; label: string }> = [
		{ value: "", label: m.settings_subtitles_off() },
		...(
			[
				["eng", "en"],
				["spa", "es"],
				["fre", "fr"],
				["ger", "de"],
				["por", "pt"],
				["ita", "it"],
				["dut", "nl"],
				["rus", "ru"],
				["jpn", "ja"],
				["kor", "ko"],
				["chi", "zh"],
				["ara", "ar"],
			] as const
		).map(([value, iso]) => ({
			value,
			label: capitalise(languageNames.of(iso) ?? value),
		})),
	];

	const qualityLabel = (q: string) =>
		q === "auto" ? m.settings_quality_auto() : q;
	const regionLabel = (code: string) =>
		code === "auto" ? m.settings_region_auto() : (regionNames.of(code) ?? code);
	const languageLabel = (code: string) =>
		subtitleLanguages.find((l) => l.value === code)?.label ??
		m.settings_subtitles_off();
</script>

<Card.Root class="border border-foreground/10">
  <Card.Header>
    <Card.Title role="heading" aria-level={2}>{m.settings_section_playback()}</Card.Title>
    <Card.Description>{m.settings_playback_description()}</Card.Description>
  </Card.Header>
  <Card.Content class="flex flex-col gap-7">
    <label class="flex items-center justify-between gap-4">
      <span class="flex flex-col gap-0.5">
        <span class="text-sm font-medium">{m.settings_autoplay()}</span>
        <span class="text-xs text-muted-foreground">
          {m.settings_autoplay_hint()}
        </span>
      </span>
      <Switch
        checked={theme.current.autoPlayNext}
        onCheckedChange={(value) => update({ autoPlayNext: value })}
      />
    </label>

    <label class="flex items-center justify-between gap-4">
      <span class="flex flex-col gap-0.5">
        <span class="text-sm font-medium">{m.settings_reuse_link()}</span>
        <span class="text-xs text-muted-foreground">
          {m.settings_reuse_link_hint()}
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
          {m.settings_link_cache_label()}
        </span>
        <Select.Root
          type="single"
          value={String(theme.current.linkCacheDays)}
          onValueChange={(v) => update({ linkCacheDays: Number(v) })}
        >
          <Select.Trigger aria-labelledby="link-cache-label" class="w-64">
            {m.settings_link_cache_days({ count: theme.current.linkCacheDays })}
          </Select.Trigger>
          <Select.Content>
            {#each [1, 2, 3, 5, 7, 14, 30] as days (days)}
              {@const label = m.settings_link_cache_days({ count: days })}
              <Select.Item value={String(days)} {label}>
                {label}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <span class="text-xs text-muted-foreground">
          {m.settings_link_cache_hint()}
        </span>
      </div>
    {/if}

    <div class="flex flex-col gap-2.5">
      <span class="text-sm font-medium" id="pref-quality-label"
        >{m.settings_quality()}</span
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
        {m.settings_quality_hint()}
      </span>
    </div>

    <div class="flex flex-col gap-2.5">
      <span class="text-sm font-medium" id="watch-region-label"
        >{m.settings_region()}</span
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
          {#each WATCH_REGIONS as code (code)}
            {@const label = regionLabel(code)}
            <Select.Item value={code} {label}>{label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      <span class="text-xs text-muted-foreground">
        {m.settings_region_hint()}
      </span>
    </div>

    <div class="flex flex-col gap-2.5">
      <span class="text-sm font-medium" id="sub-lang-label"
        >{m.settings_subtitle_language()}</span
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
        {m.settings_subtitle_language_hint()}
      </span>
    </div>

    <div class="flex flex-col gap-2.5">
      <span class="text-sm font-medium">{m.settings_subtitle_size()}</span>
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
      <span class="text-sm font-medium">{m.settings_subtitle_colour()}</span>
      <div class="flex flex-wrap gap-2.5">
        {#each subtitleColors as color (color)}
          <button
            type="button"
            aria-label={m.subtitle_colour({ color })}
            aria-pressed={theme.current.subtitleColor === color}
            onclick={() => update({ subtitleColor: color })}
            class={cn(
              // The inner hairline keeps the white swatch visible on a white card.
              "flex size-9 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] ring-2 ring-offset-2 ring-offset-card transition",
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
        <span class="text-sm font-medium">{m.settings_subtitle_background()}</span>
        <span class="text-xs text-muted-foreground">
          {m.settings_subtitle_background_hint()}
        </span>
      </span>
      <Switch
        checked={theme.current.subtitleBackground}
        onCheckedChange={(value) => update({ subtitleBackground: value })}
      />
    </label>
  </Card.Content>
</Card.Root>
