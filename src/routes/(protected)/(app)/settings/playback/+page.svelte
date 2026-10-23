<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import * as Select from "#lib/components/ui/select/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { languageKey } from "#lib/player/audio-language.js";
	import SettingsChoice from "#lib/settings/components/settings-choice.svelte";
	import SettingsGroup from "#lib/settings/components/settings-group.svelte";
	import SettingsRow from "#lib/settings/components/settings-row.svelte";
	import { getSettingsUpdate } from "#lib/settings/save-context.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import {
		EXTERNAL_PLAYERS,
		STREAM_QUALITIES,
		SUBTITLE_COLORS,
		type UiSettings,
		WATCH_REGIONS,
	} from "#lib/settings/ui-settings.js";
	import { cn } from "#lib/utils.js";
	import { page } from "$app/state";

	const update = getSettingsUpdate();

	pageTitle.set(m.settings_section_playback());

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
	const languages: Array<{ value: string; label: string }> = (
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
	}));
	const subtitleLanguages = [
		{ value: "", label: m.settings_subtitles_off() },
		...languages,
	];

	// What the Nuvio mobile app has for this profile : read, never written.
	const appAudio = $derived(
		(page.data.appAudio?.preferred as string | null | undefined) ?? null,
	);
	function audioChoiceLabel(code: string): string {
		if (code === "default") {
			return m.settings_audio_language_default();
		}
		if (code === "device") {
			return m.settings_audio_language_device();
		}
		if (code === "original") {
			return m.settings_audio_language_original();
		}
		const key = languageKey(code);
		return (
			languages.find((entry) => languageKey(entry.value) === key)?.label ??
			capitalise((key && languageNames.of(key)) || code)
		);
	}
	const audioLanguages = $derived([
		{
			value: "",
			label: appAudio
				? m.settings_audio_language_app_value({
						language: audioChoiceLabel(appAudio),
					})
				: m.settings_audio_language_app(),
		},
		{ value: "default", label: m.settings_audio_language_default() },
		{ value: "device", label: m.settings_audio_language_device() },
		...languages,
	]);
	const audioLabel = $derived(
		audioLanguages.find((entry) => entry.value === theme.current.audioLanguage)
			?.label ?? audioChoiceLabel(theme.current.audioLanguage),
	);

	const externalPlayerLabel = (player: UiSettings["externalPlayer"]) =>
		({
			browser: m.settings_external_player_browser(),
			vlc: "VLC",
			infuse: "Infuse",
			outplayer: "Outplayer",
			vidhub: "VidHub",
			iina: "IINA",
		})[player];
	const qualityLabel = (q: string) =>
		q === "auto" ? m.settings_quality_auto() : q;
	const regionLabel = (code: string) =>
		code === "auto" ? m.settings_region_auto() : (regionNames.of(code) ?? code);
	const languageLabel = (code: string) =>
		subtitleLanguages.find((l) => l.value === code)?.label ??
		m.settings_subtitles_off();
</script>

<div class="flex flex-col gap-8">
  <SettingsGroup title={m.settings_group_player()}>
    <SettingsRow inline label={m.settings_autoplay()} hint={m.settings_autoplay_hint()}>
      <Switch
        checked={theme.current.autoPlayNext}
        onCheckedChange={(value) => update({ autoPlayNext: value })}
      />
    </SettingsRow>
    <SettingsRow
      inline
      label={m.settings_touch_gestures()}
      hint={m.settings_touch_gestures_hint()}
    >
      <Switch
        checked={theme.current.touchGestures}
        onCheckedChange={(value) => update({ touchGestures: value })}
      />
    </SettingsRow>
    <SettingsRow
      label={m.settings_external_player()}
      labelId="external-player-label"
      hint={m.settings_external_player_hint()}
    >
      <Select.Root type="single" value={theme.current.externalPlayer} onValueChange={(v) => update({ externalPlayer: v as UiSettings["externalPlayer"] })}>
        <Select.Trigger aria-labelledby="external-player-label" class="w-full">
          {externalPlayerLabel(theme.current.externalPlayer)}
        </Select.Trigger>
        <Select.Content>
          {#each EXTERNAL_PLAYERS as option (option)}
            {@const label = externalPlayerLabel(option)}
            <Select.Item value={option} {label}>{label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup title={m.settings_group_sources()}>
    <SettingsRow
      label={m.settings_quality()}
      labelId="pref-quality-label"
      hint={m.settings_quality_hint()}
    >
      <Select.Root type="single" value={theme.current.preferredQuality} onValueChange={(v) => update({ preferredQuality: v as UiSettings["preferredQuality"] })}>
        <Select.Trigger aria-labelledby="pref-quality-label" class="w-full">
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
    </SettingsRow>
    <SettingsRow inline label={m.settings_reuse_link()} hint={m.settings_reuse_link_hint()}>
      <Switch
        checked={theme.current.reuseLastLink}
        onCheckedChange={(value) => update({ reuseLastLink: value })}
      />
    </SettingsRow>
    {#if theme.current.reuseLastLink}
      <SettingsRow
        label={m.settings_link_cache_label()}
        labelId="link-cache-label"
        hint={m.settings_link_cache_hint()}
      >
      <Select.Root type="single" value={String(theme.current.linkCacheDays)} onValueChange={(v) => update({ linkCacheDays: Number(v) })}>
        <Select.Trigger aria-labelledby="link-cache-label" class="w-full">
          {m.settings_link_cache_days({ count: theme.current.linkCacheDays })}
        </Select.Trigger>
        <Select.Content>
          {#each [1, 2, 3, 5, 7, 14, 30] as days (days)}
            {@const label = m.settings_link_cache_days({ count: days })}
            <Select.Item value={String(days)} {label}>{label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      </SettingsRow>
    {/if}
    <SettingsRow
      label={m.settings_region()}
      labelId="watch-region-label"
      hint={m.settings_region_hint()}
    >
      <Select.Root type="single" value={theme.current.watchRegion} onValueChange={(v) => update({ watchRegion: v as UiSettings["watchRegion"] })}>
        <Select.Trigger aria-labelledby="watch-region-label" class="w-full">
          {regionLabel(theme.current.watchRegion)}
        </Select.Trigger>
        <Select.Content>
          {#each WATCH_REGIONS as code (code)}
            {@const label = regionLabel(code)}
            <Select.Item value={code} {label}>{label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup title={m.settings_group_audio_subtitles()}>
    <SettingsRow
      label={m.settings_audio_language()}
      labelId="audio-lang-label"
      hint={m.settings_audio_language_hint()}
    >
      <Select.Root type="single" value={theme.current.audioLanguage} onValueChange={(v) => update({ audioLanguage: v })}>
        <Select.Trigger aria-labelledby="audio-lang-label" class="w-full">
          {audioLabel}
        </Select.Trigger>
        <Select.Content>
          {#each audioLanguages as option (option.value)}
            <Select.Item value={option.value} label={option.label}>
              {option.label}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </SettingsRow>
    <SettingsRow
      label={m.settings_subtitle_language()}
      labelId="sub-lang-label"
      hint={m.settings_subtitle_language_hint()}
    >
      <Select.Root type="single" value={theme.current.subtitleLanguage} onValueChange={(v) => update({ subtitleLanguage: v })}>
        <Select.Trigger aria-labelledby="sub-lang-label" class="w-full">
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
    </SettingsRow>
    <SettingsRow label={m.settings_subtitle_size()} labelId="sub-size-label">
      <SettingsChoice
        labelledby="sub-size-label"
        options={subtitleSizes}
        value={theme.current.subtitleSize}
        onSelect={(subtitleSize) => update({ subtitleSize })}
      />
    </SettingsRow>
    <SettingsRow label={m.settings_subtitle_colour()}>
      <div class="flex flex-wrap gap-3">
        {#each subtitleColors as color (color)}
          <button
            type="button"
            aria-label={m.subtitle_colour({ color })}
            aria-pressed={theme.current.subtitleColor === color}
            onclick={() => update({ subtitleColor: color })}
            class={cn(
              // The inner hairline keeps the white swatch visible on a white panel.
              "flex size-9 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] ring-2 ring-offset-2 ring-offset-background transition",
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
    </SettingsRow>
    <SettingsRow
      inline
      label={m.settings_subtitle_background()}
      hint={m.settings_subtitle_background_hint()}
    >
      <Switch
        checked={theme.current.subtitleBackground}
        onCheckedChange={(value) => update({ subtitleBackground: value })}
      />
    </SettingsRow>
  </SettingsGroup>
</div>
