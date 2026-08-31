<script lang="ts">
	import BlocksIcon from "@lucide/svelte/icons/blocks";
	import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
	import CircleUserIcon from "@lucide/svelte/icons/circle-user";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import CompassIcon from "@lucide/svelte/icons/compass";
	import FolderIcon from "@lucide/svelte/icons/folder";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LibraryBigIcon from "@lucide/svelte/icons/library-big";
	import SearchIcon from "@lucide/svelte/icons/search";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import UsersIcon from "@lucide/svelte/icons/users";
	import { Command, Dialog } from "bits-ui";
	import type { Component } from "svelte";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";

	type Destination = {
		label: string;
		href: string;
		icon: Component;
		keywords?: string[];
	};

	const destinations: Destination[] = [
		{
			label: "Home",
			href: resolve("/"),
			icon: HouseIcon,
			keywords: ["dashboard", "start"],
		},
		{
			label: "Discover",
			href: resolve("/discover"),
			icon: CompassIcon,
			keywords: ["browse", "catalog"],
		},
		{
			label: "Library",
			href: resolve("/library"),
			icon: LibraryBigIcon,
			keywords: ["saved", "my list"],
		},
		{
			label: "Collections",
			href: resolve("/collections"),
			icon: FolderIcon,
			keywords: ["folders"],
		},
		{
			label: "Watch history",
			href: resolve("/history"),
			icon: ClockIcon,
			keywords: ["recent", "watched"],
		},
		{
			label: "Your stats",
			href: resolve("/stats"),
			icon: ChartColumnIcon,
			keywords: ["minutes", "insights"],
		},
		{
			label: "Settings",
			href: resolve("/settings"),
			icon: SettingsIcon,
			keywords: ["appearance", "theme", "playback"],
		},
		{
			label: "Addons",
			href: resolve("/addons"),
			icon: BlocksIcon,
			keywords: ["sources", "providers"],
		},
		{
			label: "Account",
			href: resolve("/account"),
			icon: CircleUserIcon,
			keywords: ["profile", "password"],
		},
		{
			label: "Switch profile",
			href: resolve("/profiles"),
			icon: UsersIcon,
			keywords: ["accounts"],
		},
	];

	let open = $state(false);
	let query = $state("");

	const trimmed = $derived(query.trim());

	function onWindowKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
			event.preventDefault();
			open = !open;
		}
	}

	function go(href: string) {
		open = false;
		void goto(href);
	}

	function runSearch() {
		if (!trimmed) {
			return;
		}
		open = false;
		void goto(resolve(`/search?q=${encodeURIComponent(trimmed)}`));
	}

	$effect(() => {
		if (!open) {
			query = "";
		}
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
		/>
		<Dialog.Content
			class="fixed top-[14vh] left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
		>
			<Dialog.Title class="sr-only">Command palette</Dialog.Title>
			<Dialog.Description class="sr-only">
				Jump to a page or search for a title.
			</Dialog.Description>

			<Command.Root class="flex flex-col" loop>
				<div class="flex items-center gap-2.5 border-b border-border px-4">
					<SearchIcon class="size-4 shrink-0 text-muted-foreground" />
					<Command.Input
						bind:value={query}
						placeholder="Jump to a page or search titles…"
						class="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
				</div>

				<Command.List class="max-h-80 overflow-y-auto p-2">
					<Command.Group>
						<Command.GroupHeading
							class="px-3 py-1.5 text-xs font-medium text-muted-foreground"
						>
							Go to
						</Command.GroupHeading>
						<Command.GroupItems>
							{#each destinations as dest (dest.href)}
								<Command.Item
									value={dest.label}
									keywords={dest.keywords}
									onSelect={() => go(dest.href)}
									class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-selected:bg-accent data-selected:text-accent-foreground"
								>
									<dest.icon class="size-4 text-muted-foreground" />
									{dest.label}
								</Command.Item>
							{/each}
						</Command.GroupItems>
					</Command.Group>

					{#if trimmed}
						<Command.Group forceMount>
							<Command.GroupItems>
								<Command.Item
									value={`search ${trimmed}`}
									forceMount
									onSelect={runSearch}
									class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm outline-none data-selected:bg-accent data-selected:text-accent-foreground"
								>
									<SearchIcon class="size-4 text-muted-foreground" />
									Search for “{trimmed}”
								</Command.Item>
							</Command.GroupItems>
						</Command.Group>
					{/if}
				</Command.List>
			</Command.Root>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
