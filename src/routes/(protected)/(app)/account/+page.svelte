<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import MonitorDownIcon from "@lucide/svelte/icons/monitor-down";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import UsersIcon from "@lucide/svelte/icons/users";
	import {
		ACCOUNT_SECTIONS,
		accountSectionFrom,
	} from "#lib/account/sections.js";
	import { installPrompt } from "#lib/components/chrome/install-prompt.svelte.js";
	import ProfileAvatar from "#lib/components/chrome/profile-avatar.svelte";
	import NavGroup, {
		type NavRow,
	} from "#lib/components/layout/nav-group.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { cn } from "#lib/utils.js";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { signOut } from "../../../auth/auth.remote.ts";
	import AccountHistory from "./account-history.svelte";
	import AccountOverview from "./account-overview.svelte";
	import AccountStats from "./account-stats.svelte";
	import AccountStorage from "./account-storage.svelte";

	pageTitle.set(m.nav_account());

	let { data } = $props();

	// Which section is showing lives in the URL so it survives back/forward
	// and is shareable/deep-linkable (e.g. from the command palette). From `md`
	// up the header's section row switches it; a phone gets the list below.
	const accountRoot = resolve("account");
	const section = $derived(
		accountSectionFrom(page.url.searchParams.get("tab")),
	);
	const current = $derived(
		ACCOUNT_SECTIONS.find((entry) => entry.value === section) ??
			ACCOUNT_SECTIONS[0],
	);
	// A phone shows the profile page until a section is picked; the desktop
	// treats a bare URL as Overview.
	const picked = $derived(page.url.searchParams.has("tab"));

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

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
  {#if !picked}
    <div class="flex flex-col gap-6 md:hidden">
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
          href: `${accountRoot}?tab=${entry.value}`,
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
  {:else}
    <a
      href={accountRoot}
      class="-ml-2 flex w-fit items-center gap-0.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-primary transition active:scale-95 md:hidden"
    >
      <ChevronLeftIcon class="size-5" />
      {m.nav_account()}
    </a>
  {/if}

  <h1
    class={cn("text-3xl font-bold tracking-tight", !picked && "hidden md:block")}
  >
    {current.label}
  </h1>

  <div class={cn("min-w-0", !picked && "hidden md:block")}>
    {#if section === "overview"}
      <AccountOverview {data} />
    {:else if section === "history"}
      <AccountHistory items={data.historyItems} />
    {:else if section === "stats"}
      <AccountStats stats={data.stats} />
    {:else if section === "storage"}
      <AccountStorage {data} />
    {/if}
  </div>
</div>
