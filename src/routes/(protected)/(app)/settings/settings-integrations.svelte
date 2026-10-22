<script lang="ts">
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import { Input } from "#lib/components/ui/input/index.js";
	import { m } from "#lib/i18n/index.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { UiSettings } from "#lib/settings/ui-settings.js";
	import SettingsGroup from "./settings-group.svelte";
	import SettingsRow from "./settings-row.svelte";

	let { update }: { update: (patch: Partial<UiSettings>) => Promise<void> } =
		$props();

	// `draft` shadows `theme.current.introDbApiKey` while the field has an
	// unsaved edit; `null` means "show the stored value" (the common case).
	let draft = $state<string | null>(null);
	let visible = $state(false);
	const value = $derived(draft ?? theme.current.introDbApiKey);

	function commit() {
		if (draft === null) {
			return;
		}
		const next = draft.trim();
		draft = null;
		if (next !== theme.current.introDbApiKey) {
			void update({ introDbApiKey: next });
		}
	}
</script>

{#snippet introDbLabel()}
  <a
    href="https://theintrodb.org"
    target="_blank"
    rel="noopener noreferrer"
    class="underline underline-offset-4 hover:text-foreground"
  >
    TheIntroDB
  </a>
  {m.settings_introdb_key_suffix()}
{/snippet}

<SettingsGroup title="TheIntroDB">
  <SettingsRow label={introDbLabel} hint={m.settings_introdb_hint()}>
    <div class="relative">
      <Input
        id="introdb-key"
        aria-label={`TheIntroDB ${m.settings_introdb_key_suffix()}`}
        type={visible ? "text" : "password"}
        autocomplete="off"
        spellcheck="false"
        placeholder={m.settings_introdb_placeholder()}
        class="pr-10"
        {value}
        oninput={(event) => (draft = event.currentTarget.value)}
        onblur={commit}
        onkeydown={(event) =>
          event.key === "Enter" && event.currentTarget.blur()}
      />
      <button
        type="button"
        aria-label={visible ? m.settings_key_hide() : m.settings_key_show()}
        onclick={() => (visible = !visible)}
        class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {#if visible}<EyeOffIcon class="size-4" />{:else}<EyeIcon
            class="size-4"
          />{/if}
      </button>
    </div>
  </SettingsRow>
</SettingsGroup>
