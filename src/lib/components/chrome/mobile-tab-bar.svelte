<script lang="ts">
	import type { Component } from "svelte";
	import { m } from "#lib/i18n/index.js";
	import { cn } from "#lib/utils.js";
	import { page } from "$app/state";

	interface Tab {
		href: string;
		label: string;
		icon: Component<{ class?: string }>;
		exact?: boolean;
	}

	let { tabs }: { tabs: Tab[] } = $props();

	function isActive(tab: Tab) {
		return tab.exact
			? page.url.pathname === tab.href
			: page.url.pathname.startsWith(tab.href);
	}
</script>

<!-- Below `md` the header's nav row is hidden : this is the way around, the
     way a phone app does it. Floats clear of the home indicator. -->
<nav
  aria-label={m.shell_nav_main()}
  class="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-3xl p-1.5 md:hidden"
>
  <ul class="grid grid-cols-5 gap-1">
    {#each tabs as tab (tab.href)}
      {@const active = isActive(tab)}
      <li>
        <a
          href={tab.href}
          aria-current={active ? "page" : undefined}
          class={cn(
            "flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition-[color,background-color,transform] duration-150 select-none active:scale-95",
            active
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <tab.icon class="size-5" />
          <span class="max-w-full truncate px-1">{tab.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
