<script lang="ts">
	import SearchIcon from "@lucide/svelte/icons/search";
	import { page } from "$app/state";
	import CommandPalette from "$lib/components/command-palette.svelte";
	import HealthBanner from "$lib/components/health-banner.svelte";
	import ProfileAvatar from "$lib/components/profile-avatar.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { theme } from "$lib/settings/theme.svelte";
	import { sync } from "$lib/sync/store.svelte.js";
	import { cn } from "$lib/utils.js";
	import { signOut } from "../../auth/auth.remote";

	let { data, children } = $props();

	const nav = [
		{ href: "/", label: "Home", exact: true },
		{ href: "/discover", label: "Discover" },
		{ href: "/library", label: "Library" },
		{ href: "/collections", label: "Collections" },
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
	$effect(() => {
		const profileIndex = data.profile.profile_index;
		void sync.attach(profileIndex);
		return () => sync.detach();
	});

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

<svelte:window onscroll={() => (scrolled = window.scrollY > 12)} />

<CommandPalette />

<div
  class="relative isolate flex min-h-svh flex-col overflow-x-clip"
  data-accent={accent}
  data-amoled={amoled}
>
  <div
    class="pointer-events-none fixed inset-x-0 top-0 -z-10 hidden h-[65vh] dark:block"
    style="background: radial-gradient(70% 55% at 50% 0%, color-mix(in oklch, var(--primary) 13%, transparent), transparent 70%)"
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
        href="/"
        class="flex items-center gap-2 text-lg font-bold tracking-tight"
      >
      <img  alt="Nuvio logo" src="/logo-text.webp" width={100}/>
      </a>

      <nav class="flex items-center gap-1 text-sm">
        {#each nav as item (item.href)}
          <a
            href={item.href}
            class={cn(
              "rounded-full px-3 py-1.5 font-medium transition-colors",
              isActive(item.href, item.exact)
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </a>
        {/each}
      </nav>

      <div class="ml-auto flex items-center gap-3">
        <a
          href="/search"
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
                  <a href="/profiles" {...props}>Switch profile</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href="/history" {...props}>Watch history</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href="/stats" {...props}>Your stats</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href="/addons" {...props}>Addons</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href="/settings" {...props}>Settings</a>
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href="/account" {...props}>Account</a>
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
    class={cn(
      "mx-auto flex w-full flex-1 flex-col",
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
        >
          Support Nuvio
        </a>
        <a href="/settings" class="transition hover:text-foreground"
          >Appearance</a
        >
        <a href="/addons" class="transition hover:text-foreground">Addons</a>
      </div>
    </footer>
  </main>
</div>
