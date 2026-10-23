<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import {
		getLocale,
		type Locale,
		localeNames,
		locales,
		m,
		setLocale,
	} from "#lib/i18n/index.js";
	import SettingsChoice from "#lib/settings/components/settings-choice.svelte";
	import SettingsGroup from "#lib/settings/components/settings-group.svelte";
	import SettingsRow from "#lib/settings/components/settings-row.svelte";
	import { getSettingsUpdate } from "#lib/settings/save-context.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { Accent, UiSettings } from "#lib/settings/ui-settings.js";
	import { cn } from "#lib/utils.js";

	const update = getSettingsUpdate();

	pageTitle.set(m.settings_section_appearance());

	const modes: Array<{ value: UiSettings["mode"]; label: string }> = [
		{ value: "system", label: m.settings_mode_system() },
		{ value: "light", label: m.settings_mode_light() },
		{ value: "dark", label: m.settings_mode_dark() },
	];

	const darkStyles: Array<{
		value: UiSettings["darkStyle"];
		label: string;
		hint: string;
	}> = [
		{
			value: "dim",
			label: m.settings_dark_dim(),
			hint: m.settings_dark_dim_hint(),
		},
		{ value: "amoled", label: "AMOLED", hint: m.settings_dark_amoled_hint() },
	];

	// Swatch colour comes from `--primary` under each `[data-accent]` scope
	// (layout.css) : no second copy of the ramp to keep in sync.
	const accents: Array<{ value: Accent; label: string }> = [
		{ value: "blue", label: m.settings_accent_blue() },
		{ value: "violet", label: m.settings_accent_violet() },
		{ value: "green", label: m.settings_accent_green() },
		{ value: "rose", label: m.settings_accent_rose() },
		{ value: "amber", label: m.settings_accent_amber() },
		{ value: "cyan", label: m.settings_accent_cyan() },
		{ value: "neutral", label: m.settings_accent_neutral() },
	];

	const currentLocale = getLocale();

	function chooseLocale(locale: Locale) {
		if (locale !== currentLocale) {
			// Writes the locale cookie and reloads: SSR renders the new language.
			setLocale(locale);
		}
	}
</script>

<div class="flex flex-col gap-8">
  <SettingsGroup title={m.settings_group_theme()}>
    <SettingsRow label={m.settings_mode()} labelId="mode-label">
      <SettingsChoice
        labelledby="mode-label"
        options={modes}
        value={theme.current.mode}
        onSelect={(mode) => update({ mode })}
      />
    </SettingsRow>

    <SettingsRow label={m.settings_dark_style()} hint={m.settings_dark_style_hint()}>
      <div class="grid grid-cols-2 gap-2">
        {#each darkStyles as option (option.value)}
          <button
            type="button"
            aria-pressed={theme.current.darkStyle === option.value}
            onclick={() => update({ darkStyle: option.value })}
            class={cn(
              "flex flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-2.5 text-left text-sm transition",
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
    </SettingsRow>

    <SettingsRow label={m.settings_accent()}>
      <div class="flex flex-wrap gap-3">
        {#each accents as option (option.value)}
          <button
            type="button"
            aria-label={option.label}
            aria-pressed={theme.current.accent === option.value}
            data-accent={option.value === "neutral" ? undefined : option.value}
            onclick={() => update({ accent: option.value })}
            class={cn(
              "flex size-9 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-background transition",
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
    </SettingsRow>
  </SettingsGroup>

  <SettingsGroup title={m.settings_group_language()} headingId="language-label">
    <SettingsRow hint={m.settings_language_hint()}>
      <SettingsChoice
        labelledby="language-label"
        options={locales.map((locale) => ({
          value: locale,
          label: localeNames[locale],
          lang: locale,
        }))}
        value={currentLocale}
        onSelect={chooseLocale}
      />
    </SettingsRow>
  </SettingsGroup>
</div>
