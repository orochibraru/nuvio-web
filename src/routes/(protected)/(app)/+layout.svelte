<script lang="ts">
	import BookmarkIcon from "@lucide/svelte/icons/bookmark";
	import CircleUserIcon from "@lucide/svelte/icons/circle-user";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import MonitorDownIcon from "@lucide/svelte/icons/monitor-down";
	import SearchIcon from "@lucide/svelte/icons/search";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import ShieldIcon from "@lucide/svelte/icons/shield";
	import UsersIcon from "@lucide/svelte/icons/users";
	import XIcon from "@lucide/svelte/icons/x";
	import { ACCOUNT_SECTIONS } from "#lib/account/sections.js";
	import FirstRunNotice from "#lib/components/chrome/first-run-notice.svelte";
	import HealthBanner from "#lib/components/chrome/health-banner.svelte";
	import { installPrompt } from "#lib/components/chrome/install-prompt.svelte.js";
	import MobileTabBar from "#lib/components/chrome/mobile-tab-bar.svelte";
	import ProfileAvatar from "#lib/components/chrome/profile-avatar.svelte";
	import AuroraBackground from "#lib/components/layout/aurora-background.svelte";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { Separator } from "#lib/components/ui/separator/index.js";
	import { getVersion } from "#lib/core/version.js";
	import { downloads } from "#lib/downloads/manager.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { SEARCH_FOCUS_EVENT } from "#lib/search/focus.js";
	import { searchHistory } from "#lib/search/search-history.svelte.js";
	import { SETTINGS_SECTIONS } from "#lib/settings/sections.js";
	import { theme } from "#lib/settings/theme.svelte.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { syncOwner } from "#lib/sync/types.js";
	import { cn } from "#lib/utils.js";
	import { afterNavigate } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { signOut } from "../../auth/auth.remote.ts";

	let { data, children } = $props();

	const nav = [
		{
			href: resolve("/(protected)/(app)"),
			label: m.nav_home(),
			exact: true,
			icon: HouseIcon,
		},
		{ href: resolve("search"), label: m.nav_search(), icon: SearchIcon },
		{ href: resolve("library"), label: m.nav_library(), icon: BookmarkIcon },
		{
			href: resolve("collections"),
			label: m.nav_collections(),
			icon: LayersIcon,
		},
	];

	// The phone tab bar, like the Nuvio app's four tabs. Search is the phone's
	// Discover (its empty state is the catalog rows), and a second tap on it
	// opens the keyboard. Profile owns everything the desktop's profile menu
	// holds: account, settings, collections, downloads.
	const tabs = $derived([
		nav[0],
		{
			...nav[1],
			onReselect: () => window.dispatchEvent(new Event(SEARCH_FOCUS_EVENT)),
		},
		nav[2],
		{
			href: resolve("account"),
			label: m.nav_profile(),
			profile: data.profile,
			also: [
				resolve("settings"),
				resolve("collections"),
				resolve("downloads"),
				resolve("profiles"),
			],
		},
	]);

	$effect(() => installPrompt.listen());

	function isActive(href: string, exact?: boolean) {
		return exact
			? page.url.pathname === href
			: page.url.pathname.startsWith(href);
	}

	let scrolled = $state(false);

	// The player is a whole-page surface : no header / footer / page padding.
	const immersive = $derived(page.url.pathname.startsWith("/player/"));

	// Home and a title's page open on a full-bleed hero, which is dark media
	// whatever the theme (the hero forces `.dark` on itself). While the header
	// floats transparent over it, it takes the same dark palette : in light
	// mode its theme-coloured links and search pill were dark-on-dark.
	const overHero = $derived(
		page.url.pathname === resolve("/(protected)/(app)") ||
			page.url.pathname.startsWith("/detail/"),
	);
	const headerDark = $derived(overHero && !scrolled);

	// Settings replaces the main nav row with its own sections rather than
	// stacking a second bar under it: one bar's worth of height, and the row you
	// are navigating within is the one under your cursor. Below `md` the header
	// nav is hidden entirely, and the bare `/settings` page lists the sections.
	// Account does the same with its own sections.
	const settingsRoot = resolve("settings");
	const accountRoot = resolve("account");
	const subnav = $derived.by(() => {
		if (isActive(settingsRoot)) {
			return {
				sections: SETTINGS_SECTIONS,
				label: m.settings_sections_label(),
				leave: m.shell_leave_settings(),
			};
		}
		if (isActive(accountRoot)) {
			return {
				sections: ACCOUNT_SECTIONS,
				label: m.account_sections_label(),
				leave: m.shell_leave_account(),
			};
		}
		return null;
	});
	const onSettings = $derived(subnav !== null);

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
		if (type === "enter") {
			return;
		}
		if (!mainEl?.contains(document.activeElement)) {
			mainEl?.focus({ preventScroll: true });
		}
	});

	$effect(() => {
		theme.seed(data.ui, data.profile.id);
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
		const userId = data.user?.id;
		if (profileIndex != null && userId) {
			void sync.attach(profileIndex, userId);
			searchHistory.attach(syncOwner(userId, profileIndex));
			void downloads.attach(syncOwner(userId, profileIndex));
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

<FirstRunNotice />

<a
    href="#main-content"
    class="sr-only z-100 rounded-md bg-background px-4 py-2 text-sm font-medium ring-2 ring-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
>
    {m.shell_skip_to_content()}
</a>

<div
    class="relative isolate flex min-h-svh flex-col overflow-x-clip"
    data-accent={accent}
    data-amoled={amoled}
>
    <!-- The app-wide aurora : what the glass surfaces blur. Off behind the
         player, where nothing shows through and it would only burn GPU. -->
    {#if !immersive}
        <AuroraBackground fixed class="-z-10 opacity-25 dark:opacity-50" />
    {/if}

    <!-- `data-accent` / `data-amoled` repeat the root's: `.dark` redeclares
         `--primary`, which would otherwise shadow the chosen accent here. -->
    <header
        data-accent={headerDark ? accent : undefined}
        data-amoled={headerDark ? amoled : undefined}
        class={cn(
            "fixed z-50 text-foreground transition-[top,left,right,border-radius,background-color,box-shadow] duration-300",
            headerDark && "dark",
            immersive && "hidden",
            // Scrolled, it lifts into a floating glass bar (the player's
            // treatment); the inner padding shrinks by the same inset so the
            // logo and nav don't move.
            scrolled
                ? "glass inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] rounded-2xl sm:inset-x-4"
                : "inset-x-0 top-0 bg-transparent pt-[env(safe-area-inset-top)]",
        )}
    >
        <div
            class={cn(
                "flex h-14 items-center gap-3 transition-[padding] duration-300 md:gap-6",
                scrolled ? "px-2" : "px-4 md:px-6",
            )}
        >
            <a
                href={resolve("/(protected)/(app)")}
                class="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight"
                aria-label={m.shell_logo_home()}
            >
                <!-- The wordmark is white artwork: a dark copy for light
                     surfaces. The link's `aria-label` names it. -->
                <img
                    alt=""
                    src="/logo-text-dark.webp"
                    width={100}
                    height={32}
                    class="dark:hidden"
                />
                <img
                    alt=""
                    src="/logo-text.webp"
                    width={100}
                    height={32}
                    class="hidden dark:block"
                />
            </a>

            <!-- Both rows occupy the same grid cell, so the settings row
                 slides over the main one without changing the header's height
                 or shifting the search box. `invisible` (not just opacity-0) so
                 the hidden row cannot be tabbed into or clicked. -->
            <div class="relative hidden min-w-0 text-sm md:grid">
                <nav
                    aria-label={m.shell_nav_main()}
                    aria-hidden={onSettings ? "true" : undefined}
                    class={cn(
                        "col-start-1 row-start-1 flex items-center gap-1 transition-[opacity,transform,visibility] duration-200",
                        onSettings
                            ? "invisible -translate-y-2 opacity-0"
                            : "translate-y-0 opacity-100",
                    )}
                >
                    {#each nav as item (item.href)}
                        {@const active = isActive(item.href, item.exact)}
                        <a
                            href={item.href}
                            tabindex={onSettings ? -1 : undefined}
                            aria-current={active ? "page" : undefined}
                            class={cn(
                                "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors",
                                active
                                    ? "bg-primary/15 text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <item.icon class="size-3.5" />
                            {item.label}
                        </a>
                    {/each}
                </nav>

                <nav
                    aria-label={subnav?.label}
                    aria-hidden={onSettings ? undefined : "true"}
                    class={cn(
                        "col-start-1 row-start-1 flex items-center gap-1 transition-[opacity,transform,visibility] duration-200",
                        onSettings
                            ? "translate-y-0 opacity-100"
                            : "invisible translate-y-2 opacity-0",
                    )}
                >
                    <a
                        href={resolve("/(protected)/(app)")}
                        tabindex={onSettings ? undefined : -1}
                        title={subnav?.leave}
                        class="mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                    >
                        <XIcon class="size-4" />
                        <span class="sr-only">{subnav?.leave}</span>
                    </a>
                    {#each subnav?.sections ?? [] as section (section.value)}
                        {@const active = isActive(section.href)}
                        <a
                            href={section.href}
                            tabindex={onSettings ? undefined : -1}
                            aria-current={active ? "page" : undefined}
                            class={cn(
                                "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors",
                                active
                                    ? "bg-primary/15 text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <section.icon class="size-3.5" />
                            {section.label}
                        </a>
                    {/each}
                </nav>
            </div>

            <div class="ml-auto flex items-center gap-3">
                <!-- A phone's header has nothing else on the right: search and
                     the profile live in the tab bar. -->
                <a
                    href={settingsRoot}
                    aria-label={m.nav_settings()}
                    aria-current={isActive(settingsRoot) ? "page" : undefined}
                    class={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full border border-foreground/10 bg-foreground/5 shadow-[inset_0_1px_0_var(--glass-edge)] backdrop-blur-md transition-colors hover:bg-foreground/10 md:hidden",
                        isActive(settingsRoot)
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    <SettingsIcon class="size-4.5" />
                </a>

                <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                        aria-label={m.shell_profile_menu()}
                        class="hidden size-8 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 outline-none transition focus-visible:ring-2 focus-visible:ring-ring md:block"
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
                                        ><UsersIcon />{m.shell_switch_profile()}</a
                                    >
                                {/snippet}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item>
                                {#snippet child({ props })}
                                    <a href={resolve("settings/appearance")} {...props}
                                        ><SettingsIcon />{m.nav_settings()}</a
                                    >
                                {/snippet}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item>
                                {#snippet child({ props })}
                                    <a href={resolve("account/overview")} {...props}
                                        ><CircleUserIcon />{m.nav_account()}</a
                                    >
                                {/snippet}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item>
                                {#snippet child({ props })}
                                    <a href={resolve("downloads")} {...props}
                                        ><DownloadIcon />{m.nav_downloads()}</a
                                    >
                                {/snippet}
                            </DropdownMenu.Item>
                            {#if installPrompt.available}
                                <DropdownMenu.Item onSelect={() => installPrompt.show()}>
                                    <MonitorDownIcon />{m.shell_install_app()}
                                </DropdownMenu.Item>
                            {/if}
                            {#if data.isAdmin}
                                <DropdownMenu.Item>
                                    {#snippet child({ props })}
                                        <a href={resolve("admin")} {...props}
                                            ><ShieldIcon />{m.admin_title()}</a
                                        >
                                    {/snippet}
                                </DropdownMenu.Item>
                            {/if}
                        </DropdownMenu.Group>
                        <DropdownMenu.Separator />
                        <form {...signOut.for("header")}>
                            <DropdownMenu.Item variant="destructive">
                                {#snippet child({ props })}
                                    <button
                                        type="submit"
                                        class="w-full text-left"
                                        {...props}
                                        ><LogOutIcon />{m.common_sign_out()}</button
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
        bind:this={mainEl}
        id="main-content"
        tabindex="-1"
        class={cn(
            "flex w-full flex-1 flex-col outline-none",
            immersive
                ? "p-0"
                : "px-6 pt-(--shell-top) pb-[calc(var(--tab-bar)+2rem)] pl-[calc(1.5rem+env(safe-area-inset-left))] pr-[calc(1.5rem+env(safe-area-inset-right))] md:pb-16",
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
                "mt-16 hidden flex-col items-center gap-2 pt-6 text-center text-xs text-muted-foreground md:flex",
                immersive && "md:hidden",
            )}
        >
            <Separator class="mb-4 bg-border/60" />
            <span class="font-medium text-foreground/70"
                >Nuvio Web <span class="font-normal tabular-nums">v{getVersion()}</span></span
            >
            <span>{m.shell_footer_tagline()}</span>
            <div class="flex items-center gap-4">
                <a
                    href="https://nuvio.tv/support"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="transition hover:text-foreground">{m.shell_support_nuvio()}</a
                >

                <a
                    href={resolve("settings/appearance")}
                    class="transition hover:text-foreground">{m.shell_appearance()}</a
                >

                <a
                    href={resolve("settings/addons")}
                    class="transition hover:text-foreground">{m.settings_section_addons()}</a
                >
            </div>
        </footer>
    </main>

    {#if !immersive}
        <MobileTabBar {tabs} />
    {/if}
</div>
