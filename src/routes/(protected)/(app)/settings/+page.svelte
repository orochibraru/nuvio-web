<script lang="ts">
	import NavGroup from "#lib/components/layout/nav-group.svelte";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { SETTINGS_SECTIONS } from "#lib/settings/sections.js";
	import { resolve } from "$app/paths";

	pageTitle.set(m.nav_settings());
</script>

<div class="flex flex-col gap-6">
  <h1 class="text-4xl font-bold tracking-tight">{m.nav_settings()}</h1>
  <NavGroup
    rows={SETTINGS_SECTIONS.map((entry) => ({
      href: entry.href,
      label: entry.label,
      description: entry.description,
      icon: entry.icon,
    }))}
  />
</div>
