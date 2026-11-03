<script lang="ts">
	import {
		ADMIN_TABS,
		type AdminTab,
		adminTabSearch,
		parseAdminTab,
	} from "#lib/admin/tabs.js";
	import * as Tabs from "#lib/components/ui/tabs/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import BackendsTab from "./backends-tab.svelte";
	import DashboardTab from "./dashboard-tab.svelte";
	import NotificationsTab from "./notifications-tab.svelte";
	import SettingsTab from "./settings-tab.svelte";

	pageTitle.set(m.admin_title());

	let { data } = $props();

	const tab = $derived(parseAdminTab(page.url.searchParams.get("tab")));
	const notifications = streamed(() => data.notifications, {
		items: [],
		emailEnabled: false,
	});
	const smtp = streamed(() => data.smtp, null);
	const unread = $derived(
		notifications.current.items.filter((item) => !item.read).length,
	);

	const labels: Record<AdminTab, () => string> = {
		dashboard: m.admin_tab_dashboard,
		backends: m.admin_tab_backends,
		notifications: m.admin_tab_notifications,
		settings: m.admin_tab_settings,
	};

	function select(value: string) {
		void goto(`${resolve("admin")}${adminTabSearch(parseAdminTab(value))}`, {
			replace: true,
			reset: false,
		}).catch(() => {
			// A newer navigation won.
		});
	}

	// The env var name is code, not copy: split the sentence around it.
	const intro = m.admin_intro({ variable: "\u0000" }).split("\u0000");
</script>

<div class="flex w-full flex-col gap-6 p-4 sm:p-6">
  <div class="flex flex-col gap-1">
    <h1 class="text-3xl font-bold tracking-tight">{m.admin_title()}</h1>
    <p class="text-sm text-muted-foreground">
      {intro[0]}<code class="text-xs">NUVIO_ADMIN_EMAILS</code>{intro[1]}
    </p>
  </div>

  <Tabs.Root value={tab} onValueChange={select} class="gap-6">
    <div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <Tabs.List class="w-max">
        {#each ADMIN_TABS as value (value)}
          <Tabs.Trigger {value} class="px-3">
            {labels[value]()}
            {#if value === "notifications" && unread > 0}
              <span
                class="ml-1 rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground tabular-nums"
                aria-hidden="true">{unread}</span
              >
              <span class="sr-only">
                {m.admin_notifications_unread_count({ count: unread })}
              </span>
            {/if}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
    </div>

    <Tabs.Content value="dashboard">
      <DashboardTab
        overview={data.overview}
        activeDays={data.activeDays}
        signInDays={data.signInDays}
        newAccountDays={data.newAccountDays}
        playDays={data.playDays}
        weeks={data.weeks}
        topTitles={data.topTitles}
      />
    </Tabs.Content>
    <Tabs.Content value="backends">
      <BackendsTab backends={data.backends} builtIn={data.builtIn} />
    </Tabs.Content>
    <Tabs.Content value="notifications">
      <NotificationsTab
        items={notifications.current.items}
        emailEnabled={notifications.current.emailEnabled}
        smtpConfigured={smtp.current !== null}
      />
    </Tabs.Content>
    <Tabs.Content value="settings">
      <SettingsTab
        locked={data.locked}
        allowlist={data.allowlist}
        admins={data.admins}
        smtp={smtp.current}
        smtpReady={smtp.ready}
      />
    </Tabs.Content>
  </Tabs.Root>

  <a
    href={resolve("/(protected)/(app)")}
    class="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
  >
    {m.admin_back()}
  </a>
</div>
