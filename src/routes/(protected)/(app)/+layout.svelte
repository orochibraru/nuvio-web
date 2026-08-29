<script lang="ts">
	import { page } from "$app/state";
	import ProfileAvatar from "$lib/components/profile-avatar.svelte";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
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
</script>

<div class="min-h-svh">
	<header
		class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur"
	>
		<div class="mx-auto flex h-14 max-w-screen-2xl items-center gap-6 px-6">
			<a href="/" class="text-lg font-semibold tracking-tight">Nuvio</a>

			<nav class="flex items-center gap-1 text-sm">
				{#each nav as item (item.href)}
					<a
						href={item.href}
						class={cn(
							"rounded-md px-3 py-1.5 text-muted-foreground transition hover:text-foreground",
							isActive(item.href, item.exact) && "text-foreground",
						)}
					>
						{item.label}
					</a>
				{/each}
			</nav>

			<div class="ml-auto flex items-center gap-2">
				<a
					href="/search"
					class={cn(
						"rounded-md px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground",
						isActive("/search") && "text-foreground",
					)}
				>
					Search
				</a>

				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="size-8 overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ProfileAvatar profile={data.profile} />
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-48">
						<DropdownMenu.Label class="truncate">{data.profile.name}</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Group>
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a href="/profiles" {...props}>Switch profile</a>
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
						<form {...signOut}>
							<DropdownMenu.Item variant="destructive">
								{#snippet child({ props })}
									<button type="submit" class="w-full text-left" {...props}>Sign out</button>
								{/snippet}
							</DropdownMenu.Item>
						</form>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>
	</header>

	<main class="mx-auto max-w-screen-2xl px-6 py-8">
		{@render children()}
	</main>
</div>
