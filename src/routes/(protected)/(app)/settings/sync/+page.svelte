<script lang="ts">
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import SettingsChoice from "#lib/settings/components/settings-choice.svelte";
	import SettingsGroup from "#lib/settings/components/settings-group.svelte";
	import SettingsRow from "#lib/settings/components/settings-row.svelte";
	import { getSettingsUpdate } from "#lib/settings/save-context.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import type { UiSettings } from "#lib/settings/ui-settings.js";

	const update = getSettingsUpdate();

	pageTitle.set(m.settings_section_sync());

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
</script>

<SettingsGroup title={m.settings_group_sources()} footer={m.settings_sync_footnote()}>
  {#each [{ key: "librarySource", label: m.settings_sync_library_from() }, { key: "progressSource", label: m.settings_sync_progress_from() }] as const as row (row.key)}
    <SettingsRow label={row.label} labelId={`${row.key}-label`}>
      <SettingsChoice
        labelledby={`${row.key}-label`}
        options={syncSources.map((option) => ({
          value: option.value,
          label: option.label,
          disabled: !option.ready,
          title: option.ready
            ? undefined
            : m.settings_sync_connect_first({ name: option.label }),
        }))}
        value={theme.current[row.key]}
        onSelect={(value) => setSyncSource(row.key, value)}
      />
    </SettingsRow>
  {/each}
</SettingsGroup>
