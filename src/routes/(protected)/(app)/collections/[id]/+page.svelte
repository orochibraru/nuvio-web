<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import FolderPlusIcon from "@lucide/svelte/icons/folder-plus";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import { toast } from "svelte-sonner";
	import type { MetaPreview } from "#lib/addons/types.js";
	import { folderTitles } from "#lib/collections/collections.remote.js";
	import { CollectionsEditor } from "#lib/collections/collections-editor.svelte.js";
	import {
		addFolder,
		effectiveViewMode,
		moveFolder,
		removeFolder,
		setViewMode,
		updateFolder,
	} from "#lib/collections/edit.js";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import MediaGrid from "#lib/components/media/grid.svelte";
	import MediaRow from "#lib/components/media/row.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import type {
		Collection,
		CollectionFolder,
		CollectionViewMode,
	} from "#lib/nuvio/index.js";
	import { cn } from "#lib/utils.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import FolderDialog from "./folder-dialog.svelte";
	import FolderTile from "./folder-tile.svelte";

	let { data } = $props();

	// Everything streams in from the load (unawaited) so navigation isn't
	// blocked. `collection` resolves to `null` if `params.id` doesn't match.
	const contentsStream = streamed(
		() => data.contents,
		[] as Awaited<typeof data.contents>,
	);
	const catalogsStream = streamed(
		() => data.catalogs,
		[] as Awaited<typeof data.catalogs>,
	);
	const allCollectionsStream = streamed(
		() => data.collections,
		[] as Collection[],
	);
	// Edits are built from, and shown as, the list just saved: see
	// `CollectionsEditor` for why the load's pull is not enough.
	const editor = new CollectionsEditor(() => allCollectionsStream.current);
	const allCollections = $derived(editor.current);
	const collection = $derived(
		allCollections.find((entry) => entry.id === data.id) ?? null,
	);
	const notFound = $derived(allCollectionsStream.ready && collection === null);
	const saving = $derived(editor.saving);
	// Skeleton on the first load only. After a save the load re-runs and hands
	// down a fresh `contents` promise; flipping back to the skeleton then would
	// blank the whole page (and tear down the grid) on every edit, so the last
	// contents stay up while the new ones come in.
	let contentsLoadedOnce = $state(false);
	$effect(() => {
		if (contentsStream.ready) {
			contentsLoadedOnce = true;
		}
	});
	const contentsLoading = $derived(Boolean(collection) && !contentsLoadedOnce);

	$effect(() => {
		pageTitle.set(collection?.title ?? m.collection_fallback_title());
	});

	// Titles for folders edited on this page, fetched per folder after the
	// save; everything else comes from the load's fan-out.
	let editedTitles = $state<Record<string, MetaPreview[]>>({});

	// Folder definitions from the blob, titles from the load's fan-out.
	const folders = $derived(
		(collection?.folders ?? []).map((folder) => ({
			...folder,
			metas:
				editedTitles[folder.id] ??
				contentsStream.current.find((entry) => entry.id === folder.id)?.metas ??
				[],
		})),
	);

	/** Fetch a folder's titles after its catalogs changed. */
	async function loadTitles(folder: CollectionFolder) {
		const metas = await folderTitles($state.snapshot(folder)).catch(() => null);
		if (metas) {
			editedTitles = { ...editedTitles, [folder.id]: metas };
		}
	}

	const sourcesKey = (folder: CollectionFolder | null | undefined) =>
		JSON.stringify(folder?.catalogSources ?? []);
	const viewMode = $derived(effectiveViewMode(collection?.viewMode));

	// Posters here preload their title page on tap, not hover (`preload="tap"`
	// on every grid and row below). With `experimental.forkPreloads`, a hover
	// preload renders the detail page speculatively in a fork; on this page,
	// after an edit had been saved and a folder switched, the pointer resting
	// on a poster left every later update uncommitted : no error, dialogs just
	// stopped opening. Reproduced on a production build and fixed by exactly
	// this (e2e/collection-folders.spec.ts covers the sequence); the root cause
	// is inside the experimental fork machinery, not tracked down further.

	// The "All" tab: every folder's titles, de-duplicated by type + id.
	const allMetas = $derived.by(() => {
		const seen = new Set<string>();
		const out: (typeof folders)[number]["metas"] = [];
		for (const folder of folders) {
			for (const meta of folder.metas) {
				const key = `${meta.type}:${meta.id}`;
				if (!seen.has(key)) {
					seen.add(key);
					out.push(meta);
				}
			}
		}
		return out;
	});

	// -1 = the aggregated "All" tab, 0+ = a folder index.
	let activeTab = $state(-1);
	$effect(() => {
		if (activeTab >= folders.length) {
			activeTab = folders.length > 1 ? -1 : 0;
		}
	});

	let dialogOpen = $state(false);
	// The folder in the dialog, by id; `null` while adding one. An id rather
	// than the folder itself: the dialog then always sees the folder as it is
	// now (after a move or a save), and no object built by a `$derived` (this
	// one would carry the load's `metas`) gets copied into a second `$state`.
	let editingId = $state<string | null>(null);
	const editingIndex = $derived(
		editingId === null
			? -1
			: folders.findIndex((folder) => folder.id === editingId),
	);
	const editing = $derived(
		editingIndex >= 0 ? (collection?.folders[editingIndex] ?? null) : null,
	);

	/** The API's push is a full replace, so every edit sends the whole list. */
	// No load re-run after a save: the editor shows the list just saved, and a
	// folder whose catalogs changed fetches its own titles (`loadTitles`).
	async function persist(next: Collection[]): Promise<boolean> {
		const saved = await editor.save(next, { refresh: false });
		if (!saved) {
			toast.error(m.collection_save_error());
		}
		return saved;
	}

	function openAdd() {
		editingId = null;
		dialogOpen = true;
	}

	function openEdit(folder: CollectionFolder) {
		editingId = folder.id;
		dialogOpen = true;
	}

	async function saveFolder(draft: Omit<CollectionFolder, "id">) {
		if (!collection) {
			return;
		}
		const before = editing;
		const next = before
			? updateFolder(allCollections, collection.id, before.id, draft)
			: addFolder(allCollections, collection.id, draft);
		if (!(await persist(next))) {
			return;
		}
		dialogOpen = false;
		const saved = next
			.find((entry) => entry.id === collection?.id)
			?.folders.find((folder, index, list) =>
				before ? folder.id === before.id : index === list.length - 1,
			);
		if (saved && (!before || sourcesKey(before) !== sourcesKey(saved))) {
			void loadTitles(saved);
		}
	}

	async function move(delta: number) {
		if (!(collection && editing)) {
			return;
		}
		const target = editingIndex + delta;
		if (
			await persist(
				moveFolder(allCollections, collection.id, editing.id, delta),
			)
		) {
			activeTab = target;
		}
	}

	async function remove() {
		if (!(collection && editing)) {
			return;
		}
		if (
			await persist(removeFolder(allCollections, collection.id, editing.id))
		) {
			dialogOpen = false;
		}
	}

	const VIEW_MODES: Array<{
		value: CollectionViewMode;
		label: string;
		hint: string;
	}> = [
		{
			value: "TABBED_GRID",
			label: m.collection_view_tabs(),
			hint: m.collection_view_tabs_hint(),
		},
		{
			value: "ROWS",
			label: m.collection_view_rows(),
			hint: m.collection_view_rows_hint(),
		},
		{
			value: "FOLLOW_LAYOUT",
			label: m.collection_view_default(),
			hint: m.collection_view_default_hint(),
		},
	];

	function chooseViewMode(mode: CollectionViewMode) {
		if (collection && (collection.viewMode ?? "TABBED_GRID") !== mode) {
			void persist(setViewMode(allCollections, collection.id, mode));
		}
	}
</script>

<button
  type="button"
  onclick={() => goto(resolve("collections"))}
  class="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
>
  <ArrowLeftIcon class="size-4" /> {m.nav_collections()}
</button>

{#if notFound}
  <EmptyState
    icon={FolderPlusIcon}
    title={m.collection_not_found_title()}
    description={m.collection_not_found_description()}
  >
    {#snippet actions()}
      <Button href={resolve("collections")} variant="outline">{m.collection_all_collections()}</Button>
    {/snippet}
  </EmptyState>
{:else}
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-3xl font-bold tracking-tight">{collection?.title ?? ""}</h1>
      <div class="flex items-center gap-2">
        <div
          role="radiogroup"
          aria-label={m.collection_layout()}
          class="flex gap-1 rounded-full bg-foreground/5 p-1 text-sm"
        >
          {#each VIEW_MODES as mode (mode.value)}
            {@const checked = (collection?.viewMode ?? "TABBED_GRID") === mode.value}
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              title={mode.hint}
              disabled={saving}
              onclick={() => chooseViewMode(mode.value)}
              class={cn(
                "rounded-full px-3 py-1 font-medium transition",
                checked
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode.label}
            </button>
          {/each}
        </div>

        <Button size="sm" variant="outline" onclick={openAdd}>
          <PlusIcon data-icon="inline-start" />{m.collection_add_folder()}
        </Button>
      </div>
    </div>

    {#if collection && folders.length === 0}
      <EmptyState
        icon={FolderPlusIcon}
        title={m.collection_no_folders_title()}
        description={m.collection_no_folders_description()}
      >
        {#snippet actions()}
          <Button variant="outline" onclick={openAdd}>
            <PlusIcon data-icon="inline-start" />{m.collection_add_folder()}
          </Button>
        {/snippet}
      </EmptyState>
    {:else if !collection || contentsLoading}
      <MediaGrid items={[]} loading skeletonCount={12} />
    {:else if viewMode === "ROWS"}
      <div class="flex flex-col gap-10">
        {#each folders as folder (folder.id)}
          {@const heading = `${folder.coverEmoji ?? ""} ${folder.title}`.trim()}
          <section class="group/folder relative" aria-label={folder.title}>
            <MediaRow
              title={heading}
              titleHidden={folder.hideTitle}
              items={folder.metas}
              preload="tap"
            />
            <button
              type="button"
              aria-label={m.collection_edit_folder_named({ title: folder.title })}
              title={m.collection_edit_folder()}
              onclick={() => openEdit(folder)}
              class="absolute top-0 right-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition group-hover/folder:opacity-100 hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100"
            >
              <PencilIcon class="size-4" />
            </button>
          </section>
        {/each}
      </div>
    {:else}
      <div
        class="no-scrollbar flex items-end gap-2 overflow-x-auto border-b border-border px-1 pt-1 pb-3"
      >
        {#if folders.length > 1}
          <FolderTile
            folder={{ title: m.collection_tab_all() }}
            active={activeTab === -1}
            count={allMetas.length}
            onSelect={() => (activeTab = -1)}
          />
        {/if}
        {#each folders as folder, index (folder.id)}
          <FolderTile
            {folder}
            active={activeTab === index}
            onSelect={() => (activeTab = index)}
          />
        {/each}
        {#if activeTab >= 0 && folders[activeTab]}
          <button
            type="button"
            aria-label={m.collection_edit_folder_named({
              title: folders[activeTab].title,
            })}
            title={m.collection_edit_folder()}
            onclick={() => openEdit(folders[activeTab])}
            class="ml-auto shrink-0 self-center rounded-md p-1.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <PencilIcon class="size-4" />
          </button>
        {/if}
      </div>
      {#if activeTab === -1}
        <MediaGrid items={allMetas} preload="tap" />
      {:else if folders[activeTab]}
        {#key folders[activeTab].id}
          <MediaGrid items={folders[activeTab].metas} preload="tap" />
        {/key}
      {/if}
    {/if}
  </div>
{/if}

<FolderDialog
  bind:open={dialogOpen}
  folder={editing}
  position={editing ? { index: editingIndex, total: folders.length } : null}
  catalogs={catalogsStream.current}
  {saving}
  onSave={saveFolder}
  onMove={move}
  onDelete={remove}
/>
