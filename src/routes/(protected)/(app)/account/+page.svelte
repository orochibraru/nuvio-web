<script lang="ts">
	import DownloadIcon from "@lucide/svelte/icons/download";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import MonitorDownIcon from "@lucide/svelte/icons/monitor-down";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import UsersIcon from "@lucide/svelte/icons/users";
	import { ACCOUNT_SECTIONS } from "#lib/account/sections.js";
	import { installPrompt } from "#lib/components/chrome/install-prompt.svelte.js";
	import ProfileAvatar from "#lib/components/chrome/profile-avatar.svelte";
	import NavGroup, {
		type NavRow,
	} from "#lib/components/layout/nav-group.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { resolve } from "$app/paths";
	import { signOut } from "../../../auth/auth.remote.ts";

	pageTitle.set(m.nav_account());

	let { data } = $props();

	// On a phone this is the Profile tab: it also holds what the tab bar has
	// no room for.
	const placeRows: NavRow[] = [
		{
			href: resolve("collections"),
			label: m.nav_collections(),
			icon: LayersIcon,
		},
		{
			href: resolve("downloads"),
			label: m.nav_downloads(),
			icon: DownloadIcon,
		},
		{ href: resolve("settings"), label: m.nav_settings(), icon: SettingsIcon },
	];

	const appRows = $derived<NavRow[]>([
		{
			href: resolve("profiles"),
			label: m.shell_switch_profile(),
			icon: UsersIcon,
		},
		...(installPrompt.available
			? [
					{
						label: m.shell_install_app(),
						icon: MonitorDownIcon,
						onclick: () => installPrompt.show(),
					},
				]
			: []),
		...(data.isAdmin
			? [{ href: resolve("admin"), label: m.admin_title(), icon: ShieldIcon }]
			: []),
	]);
</script>

<div class="flex flex-col gap-6">
  <div class="flex items-center gap-4">
    <span
      class="size-16 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10"
    >
      <ProfileAvatar profile={data.profile} />
    </span>
    <div class="flex min-w-0 flex-col">
      <h1 class="truncate text-3xl font-bold tracking-tight">
        {data.profile.name}
      </h1>
      {#if data.user?.email}
        <p class="truncate text-sm text-muted-foreground">
          {data.user.email}
        </p>
      {/if}
    </div>
  </div>
  <NavGroup rows={placeRows} />
  <NavGroup
    title={m.nav_account()}
    rows={ACCOUNT_SECTIONS.map((entry) => ({
      href: entry.href,
      label: entry.label,
      description: entry.description,
      icon: entry.icon,
    }))}
  />
  <NavGroup title={m.account_group_app()} rows={appRows} />
  <form {...signOut.for("account-menu")}>
    <Button
      type="submit"
      variant="secondary"
      class="h-12 w-full rounded-full text-destructive"
    >
      <LogOutIcon data-icon="inline-start" />
      {m.common_sign_out()}
    </Button>
  </form>
</div>
