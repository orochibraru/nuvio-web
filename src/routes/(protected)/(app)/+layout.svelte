<script lang="ts">
	import BookmarkIcon from "@lucide/svelte/icons/bookmark";
	import CircleUserIcon from "@lucide/svelte/icons/circle-user";
	import CompassIcon from "@lucide/svelte/icons/compass";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import MenuIcon from "@lucide/svelte/icons/menu";
	import SearchIcon from "@lucide/svelte/icons/search";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import UsersIcon from "@lucide/svelte/icons/users";
	import XIcon from "@lucide/svelte/icons/x";
	import { Dialog as DialogPrimitive } from "bits-ui";
	import { fade, fly } from "svelte/transition";
	import CommandPalette from "#lib/components/chrome/command-palette.svelte";
	import { commandPalette } from "#lib/components/chrome/command-palette.svelte.js";
	import FirstRunNotice from "#lib/components/chrome/first-run-notice.svelte";
	import HealthBanner from "#lib/components/chrome/health-banner.svelte";
	import ProfileAvatar from "#lib/components/chrome/profile-avatar.svelte";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { Separator } from "#lib/components/ui/separator/index.js";
	import { reduced } from "#lib/core/motion.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { cn } from "#lib/utils.js";
	import { afterNavigate } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { signOut } from "../../auth/auth.remote.ts";

	let { data, children } = $props();

	const nav = [
		{
			href: resolve("/(protected)/(app)"),
			label: "Home",
			exact: true,
			icon: HouseIcon,
		},
		{ href: resolve("discover"), label: "Discover", icon: CompassIcon },
		{ href: resolve("library"), label: "Library", icon: BookmarkIcon },
		{ href: resolve("collections"), label: "Collections", icon: LayersIcon },
	];

	let mobileNavOpen = $state(false);

	function isActive(href: string, exact?: boolean) {
		return exact
			? page.url.pathname === href
			: page.url.pathname.startsWith(href);
	}

	// The player is a whole-page surface : no header / footer / page padding.
	const immersive = $derived(page.url.pathname.startsWith("/player/"));

	let scrolled = $state(false);
	let mainEl = $state<HTMLElement | null>(null);

	// On a client navigation SvelteKit resets focus to <body> (or an `autofocus`
	// element) and announces the new page title. The nav links live in this
	// persistent header though, so clicking one leaves the browser's focus right
	// there instead : the clicked <a> never left the DOM for SvelteKit's own
	// reset to kick in. Move focus into <main> whenever it lands outside it, so
	// keyboard tab order resumes at the page content rather than the skip link
	// or a stale nav link. An `autofocus` element on the new page still wins —
	// it renders inside <main>, so this is a no-op there. `type === "enter"` is
	// the initial SSR load : leave it be.
	afterNavigate(({ type }) => {
		mobileNavOpen = false;
		if (type === "enter") {
			return;
		}
		if (!mainEl?.contains(document.activeElement)) {
			mainEl?.focus({ preventScroll: true });
		}
	});

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

<svelte:window onscroll={() => (scrolled = window.scrollY > 12)} />

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
    <div class="flex h-14 items-center gap-6 px-6">
      <button
        type="button"
        aria-label="Menu"
        onclick={() => (mobileNavOpen = true)}
        class="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <MenuIcon class="size-5" />
      </button>
      <a
        href={resolve("/(protected)/(app)")}
        class="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight"
        aria-label="Nuvio : home"
      >
        <img alt="Nuvio : home" src="/logo-text.webp" width={100} />
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
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </a>
        {/each}
      </nav>

      <div class="ml-auto flex items-center gap-3">
        <a
          href={resolve("search")}
          aria-label="Search"
          aria-current={isActive("/search") ? "page" : undefined}
          onclick={(e) => {
            if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
              e.preventDefault();
              commandPalette.show();
            }
          }}
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
                  <a href={resolve("profiles")} {...props}
                    ><UsersIcon />Switch profile</a
                  >
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href={resolve("settings")} {...props}
                    ><SettingsIcon />Settings</a
                  >
                {/snippet}
              </DropdownMenu.Item>
              <DropdownMenu.Item>
                {#snippet child({ props })}
                  <a href={resolve("account")} {...props}
                    ><CircleUserIcon />Account</a
                  >
                {/snippet}
              </DropdownMenu.Item>
              {#if data.isAdmin}
                <DropdownMenu.Item>
                  {#snippet child({ props })}
                    <a href={resolve("admin")} {...props}
                      ><ShieldIcon />Server admin</a
                    >
                  {/snippet}
                </DropdownMenu.Item>
              {/if}
            </DropdownMenu.Group>
            <DropdownMenu.Separator />
            <form {...signOut.for("header")}>
              <DropdownMenu.Item variant="destructive">
                {#snippet child({ props })}
                  <button type="submit" class="w-full text-left" {...props}
                    ><LogOutIcon />Sign out</button
                  >
                {/snippet}
              </DropdownMenu.Item>
            </form>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>
  </header>

  {#if mobileNavOpen}
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          mobileNavOpen = false;
        }
      }}
    >
      <DialogPrimitive.Overlay>
        {#snippet child({ props })}
          <div
            {...props}
            class="fixed inset-0 z-100 bg-black/50 backdrop-blur-[2px] md:hidden"
            transition:fade={reduced({ duration: 150 })}
          ></div>
        {/snippet}
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content>
        {#snippet child({ props })}
          <div
            {...props}
            aria-label="Menu"
            class="fixed inset-y-0 left-0 z-100 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background outline-none md:hidden"
            transition:fly={reduced({ x: -24, duration: 220 })}
          >
            <div
              class="flex h-14 shrink-0 items-center justify-between border-b border-border px-4"
            >
              <span class="text-sm font-semibold">Menu</span>
              <button
                type="button"
                aria-label="Close menu"
                onclick={() => (mobileNavOpen = false)}
                class="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <XIcon class="size-4" />
              </button>
            </div>
            <nav class="flex flex-col gap-1 overflow-y-auto p-3">
              {#each nav as item (item.href)}
                {@const active = isActive(item.href, item.exact)}
                <a
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  class={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon class="size-5" />
                  {item.label}
                </a>
              {/each}
            </nav>
          </div>
        {/snippet}
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  {/if}

  <main
    bind:this={mainEl}
    id="main-content"
    tabindex="-1"
    class={cn(
      "flex w-full flex-1 flex-col outline-none",
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
        "mt-16 flex flex-col items-center gap-2 pt-6 text-center text-xs text-muted-foreground",
        immersive && "hidden",
      )}
    >
      <Separator class="mb-4 bg-border/60" />
      <span class="font-medium text-foreground/70">Nuvio</span>
      <span>A web client for your Nuvio library, addons and streams.</span>
      <div class="flex items-center gap-4">
        <a
          href="https://nuvio.tv/support"
          target="_blank"
          rel="noopener noreferrer"
          class="transition hover:text-foreground">Support Nuvio</a
        >

        <a href={resolve("settings")} class="transition hover:text-foreground"
          >Appearance</a
        >

        <a href={resolve("addons")} class="transition hover:text-foreground"
          >Addons</a
        >
      </div>
    </footer>
  </main>
</div>
