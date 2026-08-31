<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";
	import { goto, invalidateAll } from "$app/navigation";
	import { resolve } from "$app/paths";
	import {
		collectionContents,
		saveCollections,
	} from "$lib/collections/collections.remote";
	import EmptyState from "$lib/components/empty-state.svelte";
	import MediaGrid from "$lib/components/media-grid.svelte";
	import MediaRow from "$lib/components/media-row.svelte";
	import QueryError from "$lib/components/query-error.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { Collection, CollectionFolder } from "$lib/nuvio/index.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { streamed } from "$lib/stream.svelte.js";
	import { cn } from "$lib/utils.js";

	let { data } = $props();

	// Everything streams in from the load (unawaited) so navigation isn't
	// blocked. `collection` resolves to `null` if `params.id` doesn't match.
	const collectionStream = streamed(
		() => data.collection,
		null as Collection | null,
	);
	const catalogsStream = streamed(
		() => data.catalogs,
		[] as Awaited<typeof data.catalogs>,
	);
	const allCollectionsStream = streamed(
		() => data.collections,
		[] as Collection[],
	);
	const collection = $derived(collectionStream.current);
	const catalogs = $derived(catalogsStream.current);
	const allCollections = $derived(allCollectionsStream.current);
	const notFound = $derived(collectionStream.ready && collection === null);

	$effect(() => {
		pageTitle.set(collection?.title ?? "Collection");
	});

	let saving = $state(false);
	let addOpen = $state(false);
	let folderTitle = $state("");
	let picked = $state<string[]>([]);
	// -1 = the aggregated "All" tab, 0+ = a folder index.
	let activeTab = $state(-1);

	// Folder contents (addon catalog fetches) load client-side with a skeleton.
	const contentsQuery = $derived(
		collection ? collectionContents(collection.id) : undefined,
	);
	const contents = $derived(contentsQuery?.current);
	const contentsLoading = $derived(
		Boolean(collection) && contents === undefined && !contentsQuery?.error,
	);
	const folders = $derived(contents?.folders ?? []);
	const title = $derived(contents?.title ?? collection?.title ?? "");
	const viewMode = $derived(collection?.viewMode ?? "TABBED_GRID");

	// The "All" tab: every folder's titles, de-duplicated by type + id.
	const allMetas = $derived.by(() => {
		const seen = new Set<string>();
		const out: (typeof folders)[number]["metas"] = [];
		for (const folder of folders) {
			for (const meta of folder.metas) {
				const key = `${meta.type}:${meta.id}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				out.push(meta);
			}
		}
		return out;
	});

	// Keep the selected tab in range as folders are added / removed.
	$effect(() => {
		if (activeTab >= folders.length) {
			activeTab = folders.length > 1 ? -1 : 0;
		}
	});

	async function persist(folders: CollectionFolder[]) {
		if (!collection) {
			return;
		}
		saving = true;
		try {
			await saveCollections(
				allCollections.map((entry) =>
					entry.id === collection.id ? { ...entry, folders } : entry,
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
			...(collection?.folders ?? []),
			{ id: crypto.randomUUID(), title, catalogSources: sources },
		]);
		folderTitle = "";
		picked = [];
		addOpen = false;
	}

	function removeFolder(id: string) {
		void persist(
			(collection?.folders ?? []).filter((entry) => entry.id !== id),
		);
	}

	async function setViewMode(mode: "TABBED_GRID" | "ROWS") {
		if (!collection) {
			return;
		}
		saving = true;
		try {
			await saveCollections(
				allCollections.map((entry) =>
					entry.id === collection.id ? { ...entry, viewMode: mode } : entry,
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
	onclick={() => goto(resolve("/collections"))}
	class="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
>
	<ArrowLeftIcon class="size-4" /> Collections
</button>

{#if notFound}
	<EmptyState
		icon={FolderPlusIcon}
		title="Collection not found"
		description="This collection may have been renamed or removed."
	>
		{#snippet actions()}
			<Button href={resolve("/collections")} variant="outline">
				All collections
			</Button>
		{/snippet}
	</EmptyState>
{:else}
<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-3xl font-bold tracking-tight">{title}</h1>
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

	{#if contentsQuery?.error}
		<QueryError
			message="Couldn't load this collection's folders."
			onRetry={() => contentsQuery?.refresh()}
		/>
	{:else if contentsLoading}
		<MediaGrid items={[]} loading skeletonCount={12} />
	{:else if folders.length === 0}
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
			{#each folders as folder (folder.id)}
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
			{#if folders.length > 1}
				<button
					type="button"
					onclick={() => (activeTab = -1)}
					class={cn(
						"shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition",
						activeTab === -1
							? "bg-primary text-primary-foreground"
							: "bg-foreground/5 text-muted-foreground hover:text-foreground",
					)}
				>
					All <span class="opacity-70">{allMetas.length}</span>
				</button>
			{/if}
			{#each folders as folder, index (folder.id)}
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
			{#if activeTab >= 0 && folders[activeTab]}
				<button
					type="button"
					aria-label="Remove folder"
					onclick={() => removeFolder(folders[activeTab]?.id ?? "")}
					class="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
				>
					<Trash2Icon class="size-4" />
				</button>
			{/if}
		</div>
		{#if activeTab === -1}
			<MediaGrid items={allMetas} />
		{:else if folders[activeTab]}
			{#key folders[activeTab].id}
				<MediaGrid items={folders[activeTab].metas} />
			{/key}
		{/if}
	{/if}
</div>
{/if}

<Dialog.Root bind:open={addOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add folder</Dialog.Title>
			<Dialog.Description>Pick one or more catalogs to feed this folder.</Dialog.Description>
		</Dialog.Header>

		<Input bind:value={folderTitle} placeholder="Folder name" />

		<div class="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto scrollbar-thin">
			{#each catalogs as catalog (`${catalog.addonId}|${catalog.type}|${catalog.id}`)}
				{@const key = `${catalog.addonId}|${catalog.type}|${catalog.id}`}
				<label class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
					<Checkbox
						checked={picked.includes(key)}
						onCheckedChange={(value) => {
							picked = value
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
