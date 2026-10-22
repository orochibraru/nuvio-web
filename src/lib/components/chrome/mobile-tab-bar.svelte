<script lang="ts">
	import type { Component } from "svelte";
	import ProfileAvatar from "#lib/components/chrome/profile-avatar.svelte";
	import { m } from "#lib/i18n/index.js";
	import type { ProfileView } from "#lib/nuvio/profile.js";
	import { cn } from "#lib/utils.js";
	import { page } from "$app/state";

	interface Tab {
		href: string;
		label: string;
		icon?: Component<{ class?: string }>;
		/** Shows the profile's avatar instead of an icon. */
		profile?: ProfileView;
		exact?: boolean;
		/** Other paths this tab owns (the profile page's own pages). */
		also?: string[];
		/** Tapping the tab you're already on, like a phone app's search tab. */
		onReselect?: () => void;
	}

	let { tabs }: { tabs: Tab[] } = $props();

	function isActive(tab: Tab) {
		const path = page.url.pathname;
		if (tab.exact) {
			return path === tab.href;
		}
		return [tab.href, ...(tab.also ?? [])].some((href) =>
			path.startsWith(href),
		);
	}

	// Like the Nuvio app: scrolling down folds the labels away and leaves the
	// icons, scrolling up brings them back. A few pixels of slack so a finger
	// resting on the screen doesn't flicker it.
	let compact = $state(false);
	let lastY = 0;
	function onscroll() {
		const y = window.scrollY;
		if (y < 80 || y < lastY - 8) {
			compact = false;
		} else if (y > lastY + 8) {
			compact = true;
		} else {
			return;
		}
		lastY = y;
	}

	function onclick(event: MouseEvent, tab: Tab) {
		if (tab.onReselect && page.url.pathname === tab.href) {
			event.preventDefault();
			tab.onReselect();
		}
	}
</script>

<svelte:window {onscroll} />

<!-- Below `md` the header's nav row is hidden : this is the way around, the
     way a phone app does it. Floats clear of the home indicator. -->
<nav
  aria-label={m.shell_nav_main()}
  class="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-3xl p-1.5 md:hidden"
>
  <ul class="grid grid-cols-4 gap-1">
    {#each tabs as tab (tab.href)}
      {@const active = isActive(tab)}
      <li>
        <a
          href={tab.href}
          aria-current={active ? "page" : undefined}
          onclick={(event) => onclick(event, tab)}
          class={cn(
            "flex flex-col items-center justify-center rounded-2xl text-[11px] font-semibold transition-[color,background-color,transform,height] duration-200 select-none active:scale-95",
            compact ? "h-11" : "h-14 gap-1",
            active
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {#if tab.profile}
            <span
              class={cn(
                "-my-0.5 size-6 overflow-hidden rounded-full ring-1",
                active ? "ring-primary" : "ring-white/15",
              )}
            >
              <ProfileAvatar profile={tab.profile} />
            </span>
          {:else if tab.icon}
            <tab.icon class="size-5" />
          {/if}
          <span
            class={cn(
              "max-w-full truncate px-1 transition-[opacity,max-height] duration-200",
              compact ? "max-h-0 opacity-0" : "max-h-4 opacity-100",
            )}
          >
            {tab.label}
          </span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
