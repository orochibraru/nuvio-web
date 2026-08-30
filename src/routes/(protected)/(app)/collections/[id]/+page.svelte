<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";
	import { goto, invalidateAll } from "$app/navigation";
	import { saveCollections } from "$lib/collections/collections.remote";
	import EmptyState from "$lib/components/empty-state.svelte";
	import MediaGrid from "$lib/components/media-grid.svelte";
	import MediaRow from "$lib/components/media-row.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { CollectionFolder } from "$lib/nuvio/index.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { cn } from "$lib/utils.js";

	let { data } = $props();

	$effect(() => {
		pageTitle.set(data.contents.title ?? "Collection");
	});

	let saving = $state(false);
	let addOpen = $state(false);
	let folderTitle = $state("");
	let picked = $state<string[]>([]);
	let activeTab = $state(0);

	const contents = $derived(data.contents);
	const viewMode = $derived(data.collection.viewMode ?? "TABBED_GRID");

	async function persist(folders: CollectionFolder[]) {
		saving = true;
		try {
			await saveCollections(
				data.allCollections.map((entry) =>
					entry.id === data.collection.id ? { ...entry, folders } : entry,
				),
			);
			await invalidateAll();
		} catch {
			toast.error("Couldn't save the collection.");
		} finally {
			saving = false;
		}
	}

	async function addFolder() {
		const title = folderTitle.trim();
		if (!title || picked.length === 0) {
			return;
		}
		const sources = picked.map((key) => {
			const [addonId, type, catalogId] = key.split("|");
			return { addonId, type, catalogId };
		});
		await persist([
			...data.collection.folders,
			{ id: crypto.randomUUID(), title, catalogSources: sources },
		]);
		folderTitle = "";
		picked = [];
		addOpen = false;
	}

	function removeFolder(id: string) {
		persist(data.collection.folders.filter((entry) => entry.id !== id));
	}

	async function setViewMode(mode: "TABBED_GRID" | "ROWS") {
		saving = true;
		try {
			await saveCollections(
				data.allCollections.map((entry) =>
					entry.id === data.collection.id
						? { ...entry, viewMode: mode }
						: entry,
				),
			);
			await invalidateAll();
		} finally {
			saving = false;
		}
	}
</script>

<button
	type="button"
	onclick={() => goto("/collections")}
	class="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
>
	<ArrowLeftIcon class="size-4" /> Collections
</button>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-3xl font-bold tracking-tight">{contents.title}</h1>
		<div class="flex items-center gap-2">
			<div class="flex gap-1 rounded-full bg-foreground/5 p-1 text-sm">
				{#each ["TABBED_GRID", "ROWS"] as const as mode (mode)}
					<button
						type="button"
						onclick={() => setViewMode(mode)}
						class={cn(
							"rounded-full px-3 py-1 font-medium transition",
							viewMode === mode
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{mode === "TABBED_GRID" ? "Tabs" : "Rows"}
					</button>
				{/each}
			</div>
			<Button size="sm" variant="outline" onclick={() => (addOpen = true)}>
				<PlusIcon data-icon="inline-start" /> Add folder
			</Button>
		</div>
	</div>

	{#if contents.folders.length === 0}
		<EmptyState
			icon={FolderPlusIcon}
			title="No folders yet"
			description="Add a folder and attach one or more catalogs to fill it."
		>
			{#snippet actions()}
				<Button variant="outline" onclick={() => (addOpen = true)}>
					<PlusIcon data-icon="inline-start" /> Add folder
				</Button>
			{/snippet}
		</EmptyState>
	{:else if viewMode === "ROWS"}
		<div class="flex flex-col gap-10">
			{#each contents.folders as folder (folder.id)}
				<div class="group/folder relative">
					<MediaRow title={`${folder.coverEmoji ?? ""} ${folder.title}`.trim()} items={folder.metas} />
					<button
						type="button"
						aria-label="Remove folder"
						onclick={() => removeFolder(folder.id)}
						class="absolute top-0 right-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition group-hover/folder:opacity-100 hover:bg-destructive/10 hover:text-destructive"
					>
						<Trash2Icon class="size-4" />
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<div class="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-border pb-2">
			{#each contents.folders as folder, index (folder.id)}
				<button
					type="button"
					onclick={() => (activeTab = index)}
					class={cn(
						"shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition",
						activeTab === index
							? "bg-primary text-primary-foreground"
							: "bg-foreground/5 text-muted-foreground hover:text-foreground",
					)}
				>
					{`${folder.coverEmoji ?? ""} ${folder.title}`.trim()}
				</button>
			{/each}
			<button
				type="button"
				aria-label="Remove folder"
				onclick={() => removeFolder(contents.folders[activeTab]?.id ?? "")}
				class="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
			>
				<Trash2Icon class="size-4" />
			</button>
		</div>
		{#if contents.folders[activeTab]}
			{#key contents.folders[activeTab].id}
				<MediaGrid items={contents.folders[activeTab].metas} />
			{/key}
		{/if}
	{/if}
</div>

<Dialog.Root bind:open={addOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add folder</Dialog.Title>
			<Dialog.Description>Pick one or more catalogs to feed this folder.</Dialog.Description>
		</Dialog.Header>

		<Input bind:value={folderTitle} placeholder="Folder name" />

		<div class="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto scrollbar-thin">
			{#each data.catalogs as catalog (`${catalog.addonId}|${catalog.type}|${catalog.id}`)}
				{@const key = `${catalog.addonId}|${catalog.type}|${catalog.id}`}
				<label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
					<input
						type="checkbox"
						checked={picked.includes(key)}
						onchange={(event) => {
							picked = event.currentTarget.checked
								? [...picked, key]
								: picked.filter((entry) => entry !== key);
						}}
					/>
					<span class="truncate">{catalog.name}</span>
					<span class="text-xs text-muted-foreground">· {catalog.addonName}</span>
				</label>
			{/each}
		</div>

		<Dialog.Footer class="mt-4">
			<Button variant="ghost" onclick={() => (addOpen = false)}>Cancel</Button>
			<Button disabled={!folderTitle.trim() || picked.length === 0 || saving} onclick={addFolder}>
				Add
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
