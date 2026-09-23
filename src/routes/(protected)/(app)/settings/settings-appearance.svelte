<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import * as Card from "#lib/components/ui/card/index.js";
	import {
		getLocale,
		type Locale,
		localeNames,
		locales,
		m,
		setLocale,
	} from "#lib/i18n/index.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { Accent, UiSettings } from "#lib/settings/ui-settings.js";
	import { cn } from "#lib/utils.js";

	let { update }: { update: (patch: Partial<UiSettings>) => Promise<void> } =
		$props();

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

<Card.Root class="border border-foreground/10">
  <Card.Header>
    <Card.Title role="heading" aria-level={2}
      >{m.settings_section_appearance()}</Card.Title
    >
    <Card.Description
      >{m.settings_appearance_description()}</Card.Description
    >
  </Card.Header>
  <Card.Content class="flex flex-col gap-7">
    <div class="flex flex-col gap-2.5">
      <span class="text-sm font-medium">{m.settings_mode()}</span>
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
      <span class="text-sm font-medium">{m.settings_dark_style()}</span>
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
        {m.settings_dark_style_hint()}
      </p>
    </div>

    <div class="flex flex-col gap-2.5">
      <span class="text-sm font-medium">{m.settings_accent()}</span>
      <div class="flex flex-wrap gap-3">
        {#each accents as option (option.value)}
          <button
            type="button"
            aria-label={option.label}
            aria-pressed={theme.current.accent === option.value}
            data-accent={option.value === "neutral" ? undefined : option.value}
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

    <div class="flex flex-col gap-2.5">
      <span id="language-label" class="text-sm font-medium"
        >{m.settings_language()}</span
      >
      <div
        role="group"
        aria-labelledby="language-label"
        class="flex w-fit flex-wrap gap-1 rounded-full bg-foreground/5 p-1"
      >
        {#each locales as locale (locale)}
          <button
            type="button"
            lang={locale}
            aria-pressed={currentLocale === locale}
            onclick={() => chooseLocale(locale)}
            class={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition",
              currentLocale === locale
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {localeNames[locale]}
          </button>
        {/each}
      </div>
      <p class="text-xs text-muted-foreground">
        {m.settings_language_hint()}
      </p>
    </div>
  </Card.Content>
</Card.Root>
