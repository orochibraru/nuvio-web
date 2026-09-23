<script lang="ts">
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Checkbox } from "#lib/components/ui/checkbox/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { m } from "#lib/i18n/index.js";
	import type {
		CatalogSource,
		CollectionFolder,
		PosterShape,
	} from "#lib/nuvio/index.js";
	import { cn } from "#lib/utils.js";

	interface CatalogOption {
		addonId: string;
		addonName: string;
		type: string;
		id: string;
		name: string;
	}

	let {
		open = $bindable(false),
		folder = null,
		position = null,
		catalogs,
		saving,
		onSave,
		onMove,
		onDelete,
	}: {
		open?: boolean;
		/** The folder being edited; `null` adds a new one. */
		folder?: CollectionFolder | null;
		/** Where the edited folder sits, for the move buttons. */
		position?: { index: number; total: number } | null;
		catalogs: CatalogOption[];
		saving: boolean;
		onSave: (draft: Omit<CollectionFolder, "id">) => void;
		onMove?: (delta: number) => void;
		onDelete?: () => void;
	} = $props();

	const SHAPES: Array<{ value: PosterShape; label: string }> = [
		{ value: "POSTER", label: m.folder_shape_poster() },
		{ value: "LANDSCAPE", label: m.folder_shape_landscape() },
		{ value: "SQUARE", label: m.folder_shape_square() },
	];

	const keyOf = (source: CatalogSource) =>
		`${source.addonId}|${source.type}|${source.catalogId}`;

	let title = $state("");
	let coverEmoji = $state("");
	let coverImageUrl = $state("");
	let tileShape = $state<PosterShape>("POSTER");
	let hideTitle = $state(false);
	let picked = $state<string[]>([]);

	// Reset the draft from the folder each time the dialog opens, so an edit
	// that was cancelled does not leak into the next one.
	$effect(() => {
		if (!open) {
			return;
		}
		title = folder?.title ?? "";
		coverEmoji = folder?.coverEmoji ?? "";
		coverImageUrl = folder?.coverImageUrl ?? "";
		tileShape = folder?.tileShape ?? "POSTER";
		hideTitle = folder?.hideTitle ?? false;
		picked = (folder?.catalogSources ?? []).map(keyOf);
	});

	const imageInvalid = $derived(
		coverImageUrl.trim() !== "" && !/^https?:\/\//i.test(coverImageUrl.trim()),
	);
	const canSave = $derived(
		title.trim() !== "" && picked.length > 0 && !imageInvalid && !saving,
	);

	function save() {
		if (!canSave) {
			return;
		}
		onSave({
			title: title.trim(),
			coverEmoji,
			coverImageUrl: coverImageUrl.trim(),
			tileShape,
			hideTitle,
			catalogSources: picked.map((key) => {
				const [addonId, type, catalogId] = key.split("|");
				return { addonId, type, catalogId };
			}),
		});
	}
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{folder ? m.collection_edit_folder() : m.collection_add_folder()}</Dialog.Title>
      <Dialog.Description>
        {m.folder_dialog_description()}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
      <Field.Field>
        <Field.Label for="folder-title">{m.social_name()}</Field.Label>
        <Input id="folder-title" bind:value={title} placeholder={m.folder_name_placeholder()} />
      </Field.Field>

      <div class="grid grid-cols-[5rem_1fr] gap-3">
        <Field.Field>
          <Field.Label for="folder-emoji">{m.folder_emoji()}</Field.Label>
          <Input
            id="folder-emoji"
            bind:value={coverEmoji}
            maxlength={8}
            placeholder="🚀"
            class="text-center"
          />
        </Field.Field>
        <Field.Field data-invalid={imageInvalid || undefined}>
          <Field.Label for="folder-cover">{m.folder_cover_url()}</Field.Label>
          <Input
            id="folder-cover"
            type="url"
            bind:value={coverImageUrl}
            placeholder="https://…"
            aria-invalid={imageInvalid || undefined}
          />
          {#if imageInvalid}
            <Field.FieldError>{m.folder_cover_invalid()}</Field.FieldError>
          {/if}
        </Field.Field>
      </div>

      <Field.Field>
        <Field.Label id="folder-shape-label">{m.folder_tile_shape()}</Field.Label>
        <div
          role="radiogroup"
          aria-labelledby="folder-shape-label"
          class="flex w-fit gap-1 rounded-full bg-foreground/5 p-1 text-sm"
        >
          {#each SHAPES as shape (shape.value)}
            <button
              type="button"
              role="radio"
              aria-checked={tileShape === shape.value}
              onclick={() => (tileShape = shape.value)}
              class={cn(
                "rounded-full px-3 py-1 font-medium transition",
                tileShape === shape.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {shape.label}
            </button>
          {/each}
        </div>
        <Field.Description>
          {m.folder_shape_hint()}
        </Field.Description>
      </Field.Field>

      <Field.Field orientation="horizontal">
        <Checkbox
          id="folder-hide-title"
          checked={hideTitle}
          onCheckedChange={(value) => (hideTitle = value === true)}
        />
        <Field.Label for="folder-hide-title">{m.folder_hide_title()}</Field.Label>
      </Field.Field>

      <fieldset class="flex flex-col gap-1">
        <legend class="mb-1 text-sm font-medium">{m.folder_catalogs()}</legend>
        {#each catalogs as catalog (`${catalog.addonId}|${catalog.type}|${catalog.id}`)}
          {@const key = `${catalog.addonId}|${catalog.type}|${catalog.id}`}
          <label
            class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
          >
            <Checkbox
              checked={picked.includes(key)}
              onCheckedChange={(value) => {
                picked = value
                  ? [...picked, key]
                  : picked.filter((entry) => entry !== key);
              }}
            />
            <span class="truncate">{catalog.name}</span>
            <!-- An addon usually serves the same catalog name for movies and
                 for series : without the type the two rows are identical. -->
            <span class="text-xs text-muted-foreground"
              >· {catalog.type === "series" ? m.common_series() : catalog.type === "movie" ? m.common_movies() : catalog.type} · {catalog.addonName}</span
            >
          </label>
        {:else}
          <p class="text-sm text-muted-foreground">
            {m.folder_no_catalogs()}
          </p>
        {/each}
      </fieldset>
    </div>

    <Dialog.Footer class="mt-2 flex-wrap gap-2 sm:justify-between">
      {#if folder && position}
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.folder_move_earlier_label()}
            title={m.folder_move_earlier()}
            disabled={position.index === 0 || saving}
            onclick={() => onMove?.(-1)}
          >
            <ArrowLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.folder_move_later_label()}
            title={m.folder_move_later()}
            disabled={position.index === position.total - 1 || saving}
            onclick={() => onMove?.(1)}
          >
            <ArrowRightIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.folder_delete()}
            title={m.folder_delete()}
            disabled={saving}
            onclick={() => onDelete?.()}
            class="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon />
          </Button>
        </div>
      {/if}
      <div class="flex gap-2">
        <Button variant="ghost" onclick={() => (open = false)}>{m.common_cancel()}</Button>
        <Button disabled={!canSave} onclick={save}>{folder ? m.common_save() : m.common_add()}</Button>
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
