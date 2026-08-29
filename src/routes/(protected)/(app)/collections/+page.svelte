<script lang="ts">
	import PinIcon from "@lucide/svelte/icons/pin";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";
	import { invalidateAll } from "$app/navigation";
	import { saveCollections } from "$lib/collections/collections.remote";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { Collection } from "$lib/nuvio/index.js";
	import { cn } from "$lib/utils.js";

	let { data } = $props();

	let saving = $state(false);
	let dialogOpen = $state(false);
	let newTitle = $state("");
	let renaming = $state<Collection | null>(null);
	let renameTitle = $state("");

	async function persist(next: Collection[]) {
		saving = true;
		try {
			await saveCollections(next);
			await invalidateAll();
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
			...data.collections,
			{ id: crypto.randomUUID(), title, viewMode: "TABBED_GRID", folders: [] },
		]);
		newTitle = "";
		dialogOpen = false;
	}

	function togglePin(collection: Collection) {
		persist(
			data.collections.map((entry) =>
				entry.id === collection.id
					? { ...entry, pinToTop: !entry.pinToTop }
					: entry,
			),
		);
	}

	function remove(collection: Collection) {
		persist(data.collections.filter((entry) => entry.id !== collection.id));
	}

	async function applyRename() {
		const title = renameTitle.trim();
		if (!renaming || !title) {
			return;
		}
		const target = renaming;
		renaming = null;
		await persist(
			data.collections.map((entry) =>
				entry.id === target.id ? { ...entry, title } : entry,
			),
		);
	}

	const sorted = $derived(
		[...data.collections].sort(
			(a, b) => Number(Boolean(b.pinToTop)) - Number(Boolean(a.pinToTop)),
		),
	);
</script>

<div class="flex flex-col gap-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold tracking-tight">Collections</h1>
		<Button onclick={() => (dialogOpen = true)}>
			<PlusIcon data-icon="inline-start" /> New collection
		</Button>
	</div>

	{#if sorted.length === 0}
		<div class="rounded-lg border border-border p-8 text-center">
			<p class="font-medium">No collections yet</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Group catalogs into folders for a custom home layout.
			</p>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each sorted as collection (collection.id)}
				<div
					class={cn(
						"flex items-center gap-3 rounded-lg border border-border p-4 transition hover:border-foreground/30",
						saving && "opacity-60",
					)}
				>
					<a href={`/collections/${collection.id}`} class="min-w-0 flex-1">
						<div class="flex items-center gap-1.5">
							{#if collection.pinToTop}
								<PinIcon class="size-3.5 text-muted-foreground" />
							{/if}
							<span class="truncate font-medium">{collection.title}</span>
						</div>
						<p class="text-xs text-muted-foreground">
							{collection.folders.length} folder{collection.folders.length === 1 ? "" : "s"}
						</p>
					</a>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							class="rounded-md px-1.5 text-muted-foreground hover:text-foreground"
						>
							&#8942;
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
							<DropdownMenu.Item variant="destructive" onclick={() => remove(collection)}>
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
			<Button variant="ghost" onclick={() => (dialogOpen = false)}>Cancel</Button>
			<Button disabled={!newTitle.trim() || saving} onclick={create}>Create</Button>
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
			<Button variant="ghost" onclick={() => (renaming = null)}>Cancel</Button>
			<Button disabled={!renameTitle.trim() || saving} onclick={applyRename}>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
