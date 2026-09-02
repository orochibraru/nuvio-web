<script lang="ts">
  import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
  import CircleUserIcon from "@lucide/svelte/icons/circle-user";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import HardDriveIcon from "@lucide/svelte/icons/hard-drive";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { pageTitle } from "#lib/stores/title.svelte.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import AccountHistory from "./account-history.svelte";
  import AccountOverview from "./account-overview.svelte";
  import AccountStats from "./account-stats.svelte";
  import AccountStorage from "./account-storage.svelte";

  pageTitle.set("Account");

  let { data } = $props();

  // Which section is showing lives in the URL so it survives back/forward
  // and is shareable/deep-linkable (e.g. from the command palette).
  const tabs = [
    { value: "overview", label: "Overview", icon: CircleUserIcon },
    { value: "history", label: "Watch history", icon: ClockIcon },
    { value: "stats", label: "Stats", icon: ChartColumnIcon },
    { value: "storage", label: "Storage & sync", icon: HardDriveIcon },
  ] as const;
  type Tab = (typeof tabs)[number]["value"];
  const tab = $derived<Tab>(
    (tabs.find((t) => t.value === page.url.searchParams.get("tab"))?.value ??
      "overview") as Tab,
  );

  function setTab(value: string) {
    const params = new URLSearchParams(page.url.search);
    if (value === "overview") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const query = params.toString();
    void goto(query ? `?${query}` : "?", { reset: false });
  }
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-8">
  <h1 class="text-3xl font-bold tracking-tight">Account</h1>

  <!-- `Tabs.Root` renders as `display:contents` : the actual row/column layout
	     is owned by this wrapper (stacked on narrow screens, sidebar from lg up)
	     so it never fights bits-ui's own orientation-driven flex classes. -->
  <div class="flex flex-col gap-8 lg:flex-row lg:items-start">
    <Tabs.Root
      value={tab}
      onValueChange={setTab}
      orientation="vertical"
      class="contents"
    >
      <Tabs.List
        class="h-fit w-full shrink-0 gap-1 rounded-xl border border-foreground/10 bg-card p-2 lg:w-56"
      >
        {#each tabs as t (t.value)}
          <Tabs.Trigger
            value={t.value}
            class="gap-2.5 rounded-lg px-3 py-2.5 text-[0.9rem] font-medium data-[state=active]:bg-foreground/10 data-[state=active]:shadow-none"
          >
            <t.icon class="size-4" />
            {t.label}
          </Tabs.Trigger>
        {/each}
      </Tabs.List>

      <Tabs.Content value="overview" class="min-w-0">
        <AccountOverview {data} />
      </Tabs.Content>
      <Tabs.Content value="history" class="min-w-0">
        <AccountHistory items={data.historyItems} />
      </Tabs.Content>
      <Tabs.Content value="stats" class="min-w-0">
        <AccountStats stats={data.stats} />
      </Tabs.Content>
      <Tabs.Content value="storage" class="min-w-0">
        <AccountStorage {data} />
      </Tabs.Content>
    </Tabs.Root>
  </div>
</div>
