<script lang="ts">
	import FolderIcon from "@lucide/svelte/icons/folder";
	import LayersIcon from "@lucide/svelte/icons/layers";
	import MoreVerticalIcon from "@lucide/svelte/icons/more-vertical";
	import PinIcon from "@lucide/svelte/icons/pin";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";
	import { saveCollections } from "#lib/collections/collections.remote.js";
	import EmptyState from "#lib/components/empty-state.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import type { Collection } from "#lib/nuvio/index.js";
	import { pageTitle } from "#lib/stores/title.svelte.js";
	import { streamed } from "#lib/stream.svelte.js";
	import { cn } from "#lib/utils.js";
	import { refreshAll } from "$app/navigation";
	import { resolve } from "$app/paths";

	pageTitle.set("Collections");

	let { data } = $props();

	// Streamed in from the load (unawaited) so navigation isn't blocked.
	const collectionsStream = streamed(
		() => data.collections,
		[] as Collection[],
	);
	const collections = $derived(collectionsStream.current);
	const collectionsReady = $derived(collectionsStream.ready);

	let saving = $state(false);
	let dialogOpen = $state(false);
	let newTitle = $state("");
	let renaming = $state<Collection | null>(null);
	let renameTitle = $state("");

	async function persist(next: Collection[]) {
		saving = true;
		try {
			await saveCollections(next);
			await refreshAll();
		} catch {
			toast.error("Couldn't save collections.");
		} finally {
			saving = false;
		}
	}

	async function create() {
		const title = newTitle.trim();
		if (!title) {
			return;
		}
		await persist([
			...collections,
			{ id: crypto.randomUUID(), title, viewMode: "TABBED_GRID", folders: [] },
		]);
		newTitle = "";
		dialogOpen = false;
	}

	function togglePin(collection: Collection) {
		void persist(
			collections.map((entry) =>
				entry.id === collection.id
					? { ...entry, pinToTop: !entry.pinToTop }
					: entry,
			),
		);
	}

	let confirmingDelete = $state<Collection | null>(null);

	function remove(collection: Collection) {
		const target = collection;
		confirmingDelete = null;
		void persist(collections.filter((entry) => entry.id !== target.id));
	}

	async function applyRename() {
		const title = renameTitle.trim();
		if (!(renaming && title)) {
			return;
		}
		const target = renaming;
		renaming = null;
		await persist(
			collections.map((entry) =>
				entry.id === target.id ? { ...entry, title } : entry,
			),
		);
	}

	const sorted = $derived(
		[...collections].sort(
			(a, b) => Number(Boolean(b.pinToTop)) - Number(Boolean(a.pinToTop)),
		),
	);
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div class="flex flex-col gap-1">
			<h1 class="text-3xl font-bold tracking-tight">Collections</h1>
			<p class="text-sm text-muted-foreground">Group catalogs into folders for a custom layout.</p>
		</div>

		<Button onclick={() => dialogOpen = true}>
			<PlusIcon data-icon="inline-start" />
			New collection
		</Button>
	</div>

	{#if !collectionsReady && sorted.length === 0}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each { length: 3 } as _skeleton, i (i)}
				<div class="skeleton h-20 rounded-xl"></div>
			{/each}
		</div>
	{:else if sorted.length === 0}
		<EmptyState
			icon={LayersIcon}
			title="No collections yet"
			description="Bundle catalogs from your addons into folders and browse them your way."
		>
			{#snippet actions()}
				<Button onclick={() => dialogOpen = true}>
					<PlusIcon data-icon="inline-start" />
					New collection
				</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each sorted as collection (collection.id)}
				<div
					class={cn(
						"group/col flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:bg-card",
						saving && "opacity-60",
					)}
				>
					<span
						class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-muted-foreground transition-colors group-hover/col:text-primary"
					><FolderIcon class="size-5" /></span>

					<a
						href={resolve(`collections/${collection.id}`)}
						class="min-w-0 flex-1"
					>
						<div class="flex items-center gap-1.5">
							{#if collection.pinToTop}
								<PinIcon class="size-3.5 shrink-0 text-primary" />
							{/if}
							<span class="truncate font-semibold">{collection.title}</span>
						</div>
						<p class="text-xs text-muted-foreground">
							{collection.folders.length} folder{collection.folders.length === 1 ? "" : "s"}
						</p>
					</a>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							aria-label="Collection actions"
							class="rounded-md p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
						>
							<MoreVerticalIcon class="size-4" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Item onclick={() => togglePin(collection)}>
								{collection.pinToTop ? "Unpin" : "Pin to top"}
							</DropdownMenu.Item>
							<DropdownMenu.Item
								onclick={() => {
									renaming = collection;
									renameTitle = collection.title;
								}}
							>
								Rename
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								variant="destructive"
								onclick={() => (confirmingDelete = collection)}
							>
								Delete
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>New collection</Dialog.Title>
		</Dialog.Header>
		<Input
			bind:value={newTitle}
			placeholder="Collection name"
			onkeydown={(event) => event.key === "Enter" && create()}
		/>
		<Dialog.Footer class="mt-4">
			<Button variant="ghost" onclick={() => dialogOpen = false}>Cancel</Button>

			<Button
				disabled={!newTitle.trim() || saving}
				onclick={create}
			>Create</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root open={renaming !== null} onOpenChange={(open) => !open && (renaming = null)}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Rename collection</Dialog.Title>
		</Dialog.Header>
		<Input
			bind:value={renameTitle}
			onkeydown={(event) => event.key === "Enter" && applyRename()}
		/>
		<Dialog.Footer class="mt-4">
			<Button variant="ghost" onclick={() => renaming = null}>Cancel</Button>

			<Button
				disabled={!renameTitle.trim() || saving}
				onclick={applyRename}
			>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root
	open={confirmingDelete !== null}
	onOpenChange={(open) => !open && (confirmingDelete = null)}
>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Delete "{confirmingDelete?.title}"?</Dialog.Title>
			<Dialog.Description>
				The collection and its folders are removed. Titles in your library stay.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="mt-4">
			<Button variant="ghost" onclick={() => (confirmingDelete = null)}>
				Cancel
			</Button>
			<Button
				variant="destructive"
				disabled={saving}
				onclick={() => confirmingDelete && remove(confirmingDelete)}
			>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
