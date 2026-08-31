<script lang="ts">
	import MenuIcon from "@lucide/svelte/icons/menu";
	import SearchIcon from "@lucide/svelte/icons/search";
	import CommandPalette from "#lib/components/command-palette.svelte";
	import FirstRunNotice from "#lib/components/first-run-notice.svelte";
	import HealthBanner from "#lib/components/health-banner.svelte";
	import ProfileAvatar from "#lib/components/profile-avatar.svelte";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { cn } from "#lib/utils.js";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { signOut } from "../../auth/auth.remote.ts";

	let { data, children } = $props();

	const nav = [
		{ href: resolve("/(protected)/(app)"), label: "Home", exact: true },
		{ href: resolve("discover"), label: "Discover" },
		{ href: resolve("library"), label: "Library" },
		{ href: resolve("collections"), label: "Collections" },
	];

	function isActive(href: string, exact?: boolean) {
		return exact
			? page.url.pathname === href
			: page.url.pathname.startsWith(href);
	}

	// The player is a whole-page surface — no header / footer / page padding.
	const immersive = $derived(page.url.pathname.startsWith("/player/"));

	let scrolled = $state(false);

	$effect(() => {
		theme.seed(data.ui);
	});

	// Local-first store for library / progress / history: hydrates from IndexedDB,
	// reconciles deltas in the background, flushes optimistic writes.
	// `attach` no-ops when the profile is unchanged, so it is safe for this to
	// re-run on every navigation. `detach` must NOT be this effect's cleanup —
	// that fires on every nav and would clear the pending-write queue / cancel a
	// scheduled flush mid-navigation (losing watch progress). Detach only when
	// the whole app shell unmounts.
	$effect(() => {
		const profileIndex = data.profile?.profile_index;
		if (profileIndex != null) {
			void sync.attach(profileIndex);
		}
	});
	$effect(() => () => sync.detach());

	// Server value for SSR / first paint; the client controller takes over once seeded.
	const active = $derived(theme.ready ? theme.current : data.ui);
	const accent = $derived(active.accent);
	const amoled = $derived(active.darkStyle === "amoled");

	$effect(() => {
		const root = document.documentElement;
		root.dataset.accent = accent;
		root.dataset.amoled = String(amoled);
		return () => {
			delete root.dataset.accent;
			delete root.dataset.amoled;
		};
	});
</script>

<svelte:window onscroll={() => scrolled = window.scrollY > 12}></svelte:window>

<CommandPalette />
<FirstRunNotice />

<a
  href="#main-content"
  class="sr-only z-100 rounded-md bg-background px-4 py-2 text-sm font-medium ring-2 ring-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
>
  Skip to content
</a>

<div
  class="relative isolate flex min-h-svh flex-col overflow-x-clip"
  data-accent={accent}
  data-amoled={amoled}
>
  <div
    class="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[70vh] opacity-60 dark:opacity-100"
    style="background: radial-gradient(65% 50% at 50% 0%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 70%)"
  ></div>
  <div
    class="pointer-events-none fixed -top-40 -right-40 -z-10 hidden size-140 rounded-full opacity-20 blur-3xl dark:block"
    style="background: radial-gradient(circle, color-mix(in oklch, var(--primary) 40%, transparent), transparent 70%)"
  ></div>

  <header
    class={cn(
      "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
      immersive && "hidden",
      scrolled
        ? "border-b border-border bg-background/80 backdrop-blur-xl"
        : "border-b border-transparent bg-transparent",
    )}
  >
    <div class="mx-auto flex h-14 items-center gap-6 px-6">
      <a
        href={resolve("/(protected)/(app)")}
        class="flex items-center gap-2 text-lg font-bold tracking-tight"
      >
      <img  alt="Nuvio logo" src="/logo-text.webp" width={100}/>
      </a>

      <nav class="hidden items-center gap-1 text-sm md:flex">
        {#each nav as item (item.href)}
          {@const active = isActive(item.href, item.exact)}
          <a
            href={item.href}
            aria-current={active ? "page" : undefined}
            class={cn(
              "rounded-full px-3 py-1.5 font-medium transition-colors",
              active
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </a>
        {/each}
      </nav>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Menu"
          class="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <MenuIcon class="size-5" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="start" class="w-44">
          <DropdownMenu.Group>
            {#each nav as item (item.href)}
              <DropdownMenu.Item class={isActive(item.href, item.exact) ? "font-medium text-foreground" : ""}>
                {#snippet child({ props })}
                  <a href={item.href} {...props}>{item.label}</a>
                {/snippet}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <div class="ml-auto flex items-center gap-3">
        <a
          href={resolve('search')}
          aria-current={isActive("/search") ? "page" : undefined}
          class={cn(
            "flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1.5 text-sm transition-colors",
            isActive("/search")
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <SearchIcon class="size-4" />
          <span class="hidden sm:inline">Search</span>
          <kbd
            class="ml-1 hidden rounded border border-border bg-muted px-1.5 font-sans text-[10px] text-muted-foreground sm:inline"
          >
            ⌘K
          </kbd>
        </a>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label="Profile menu"
            class="size-8 overflow-hidden rounded-lg ring-1 ring-white/10 outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ProfileAvatar profile={data.profile} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-52">
            <DropdownMenu.Label class="truncate"
              >{data.profile.name}</DropdownMenu.Label
            >
            <DropdownMenu.Separator />
            <DropdownMenu.Group>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href={resolve('profiles')} {...props}>Switch profile</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href={resolve('history')} {...props}>Watch history</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href={resolve('stats')} {...props}>Your stats</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href={resolve('addons')} {...props}>Addons</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href={resolve('settings')} {...props}>Settings</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href={resolve('account')} {...props}>Account</a>
                {/snippet}
              </DropdownMenu.Item>
            </DropdownMenu.Group>
            <DropdownMenu.Separator />
            <DropdownMenu.Separator />
            <form {...signOut}>
              <DropdownMenu.Item variant="destructive">
                {#snippet child({ props })}
                  <button type="submit" class="w-full text-left" {...props}
                    >Sign out</button
                  >
                {/snippet}
              </DropdownMenu.Item>
            </form>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  </header>

  <main
    id="main-content"
    tabindex="-1"
    class={cn(
      "mx-auto flex w-full flex-1 flex-col outline-none",
      immersive ? "p-0" : "px-6 pt-20 pb-16",
    )}
  >
    <div class="flex-1">
      {#if !immersive}
        <HealthBanner />
      {/if}
      {@render children()}
    </div>

    <footer
      class={cn(
        "mt-16 flex flex-col items-center gap-2 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground",
        immersive && "hidden",
      )}
    >
      <span class="font-medium text-foreground/70">Nuvio</span>
      <span>A web client for your Nuvio library, addons and streams.</span>
      <div class="flex items-center gap-4">
        <a
          href="https://nuvio.tv/support"
          target="_blank"
          rel="noopener noreferrer"
          class="transition hover:text-foreground"
        >Support Nuvio</a>

        <a
          href={resolve('settings')}
          class="transition hover:text-foreground"
        >Appearance</a>

        <a
          href={resolve('addons')}
          class="transition hover:text-foreground"
        >Addons</a>
      </div>
    </footer>
  </main>
</div>
