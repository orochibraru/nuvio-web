<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import CompassIcon from "@lucide/svelte/icons/compass";
	import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PowerIcon from "@lucide/svelte/icons/power";
	import PowerOffIcon from "@lucide/svelte/icons/power-off";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { toast } from "svelte-sonner";
	import {
		addonCatalogSources,
		browseAddonCatalog,
		installedAddons,
		previewAddon,
		saveAddons,
	} from "#lib/addons/addons.remote.js";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { cn } from "#lib/utils.js";

	pageTitle.set("Addons");

	interface Row {
		url: string;
		name: string;
		enabled: boolean;
	}

	const addonsQuery = installedAddons();
	const catalogSourcesQuery = addonCatalogSources();

	let saving = $state(false);
	let dialogOpen = $state(false);
	let addUrl = $state("");
	let previewing = $state(false);
	let preview = $state<Awaited<ReturnType<typeof previewAddon>> | null>(null);

	// While any addon can't be reached, re-poll every 5s so the list reflects a
	// recovery without a manual reload (the server registry retries on the same
	// cadence).
	const anyUnreachable = $derived(
		Boolean(addonsQuery.current) &&
			((addonsQuery.current?.errors.length ?? 0) > 0 ||
				(addonsQuery.current?.addons ?? []).some((addon) => !addon.reachable)),
	);
	$effect(() => {
		if (!anyUnreachable || saving) {
			return;
		}
		const timer = setInterval(() => void addonsQuery.refresh(), 5000);
		return () => clearInterval(timer);
	});

	function toRows(): Row[] {
		return (addonsQuery.current?.addons ?? []).map((addon) => ({
			url: addon.url,
			name: addon.name,
			enabled: addon.enabled,
		}));
	}

	async function persist(rows: Row[]) {
		saving = true;
		try {
			await saveAddons(rows);
			await addonsQuery.refresh();
		} catch {
			toast.error("Couldn't save addon changes.");
		} finally {
			saving = false;
		}
	}

	function setEnabled(url: string, enabled: boolean) {
		void persist(
			toRows().map((row) => (row.url === url ? { ...row, enabled } : row)),
		);
	}

	let confirmRemove = $state<{ url: string; name: string } | null>(null);

	function removeAddon(url: string) {
		confirmRemove = null;
		void persist(toRows().filter((row) => row.url !== url));
		toast.success("Addon removed");
	}

	function move(url: string, delta: number) {
		const rows = toRows();
		const index = rows.findIndex((row) => row.url === url);
		const target = index + delta;
		if (index < 0 || target < 0 || target >= rows.length) {
			return;
		}
		[rows[index], rows[target]] = [rows[target], rows[index]];
		void persist(rows);
	}

	// Drag reorder. `dragUrl` is the row being dragged, `dropUrl` the row it is
	// hovering over (for the drop indicator).
	let dragUrl = $state<string | null>(null);
	let dropUrl = $state<string | null>(null);

	function onDrop() {
		const from = dragUrl;
		const to = dropUrl;
		dragUrl = null;
		dropUrl = null;
		if (!(from && to) || from === to) {
			return;
		}
		const rows = toRows();
		const fromIndex = rows.findIndex((row) => row.url === from);
		const toIndex = rows.findIndex((row) => row.url === to);
		if (fromIndex < 0 || toIndex < 0) {
			return;
		}
		const [moved] = rows.splice(fromIndex, 1);
		rows.splice(toIndex, 0, moved);
		void persist(rows);
	}

	// One button: resolve the manifest, then install it. The preview card renders
	// while it resolves; on success the dialog closes.
	async function addAddon() {
		if (!addUrl || previewing || saving) {
			return;
		}
		previewing = true;
		preview = null;
		try {
			preview = await previewAddon(addUrl);
		} catch {
			preview = { ok: false, message: "Enter a valid addon URL." };
		} finally {
			previewing = false;
		}
		const current = preview;
		if (!current?.ok) {
			return;
		}
		const rows = toRows();
		if (rows.some((row) => row.url === current.baseUrl)) {
			toast.info("That addon is already installed.");
			dialogOpen = false;
			return;
		}
		await persist([
			...rows,
			{ url: current.baseUrl, name: current.manifest.name, enabled: true },
		]);
		toast.success(`Added ${current.manifest.name}.`);
		dialogOpen = false;
		addUrl = "";
		preview = null;
	}

	// Metadata-only providers : safe to suggest (no scraper / torrent sources).
	const SUGGESTED = [
		{
			name: "Cinemeta",
			url: "https://v3-cinemeta.strem.io/manifest.json",
			blurb: "Catalogs, posters and metadata for films and TV (IMDb ids).",
		},
		{
			name: "TMDB",
			url: "https://94c8cb9f702d-tmdb-addon.baby-beamup.club/manifest.json",
			blurb: "The Movie Database catalogs and artwork, many languages.",
		},
	];

	let addingSuggested = $state<string | null>(null);

	async function addSuggested(entry: (typeof SUGGESTED)[number]) {
		if (addingSuggested) {
			return;
		}
		const rows = toRows();
		if (rows.some((row) => `${row.url}/manifest.json` === entry.url)) {
			toast.info("That addon is already installed.");
			return;
		}
		addingSuggested = entry.url;
		try {
			await doAddSuggested(entry, rows);
		} finally {
			addingSuggested = null;
		}
	}

	async function doAddSuggested(
		entry: (typeof SUGGESTED)[number],
		rows: ReturnType<typeof toRows>,
	) {
		const result = await previewAddon(entry.url).catch(() => null);
		if (!result?.ok) {
			toast.error(`Couldn't reach ${entry.name}.`);
			return;
		}
		await persist([
			...rows,
			{ url: result.baseUrl, name: result.manifest.name, enabled: true },
		]);
		toast.success(`Added ${result.manifest.name}.`);
	}

	// "Discover more addons" : addons that themselves advertise an
	// `addon_catalog` (a community directory of other addons). Browsing one
	// lazily fetches its listing; installing one re-verifies the manifest via
	// `previewAddon` rather than trusting the directory's own copy of it.
	type CatalogSource = Awaited<ReturnType<typeof addonCatalogSources>>[number];
	type CatalogEntry = Awaited<
		ReturnType<typeof browseAddonCatalog>
	>["addons"][number];

	let browseOpen = $state(false);
	let browseSource = $state<CatalogSource | null>(null);
	const browseQuery = $derived(
		browseSource
			? browseAddonCatalog({
					addonId: browseSource.addonId,
					type: browseSource.type,
					id: browseSource.id,
				})
			: undefined,
	);

	function openBrowse(source: CatalogSource) {
		browseSource = source;
		browseOpen = true;
	}

	let installingUrl = $state<string | null>(null);

	async function installFromCatalog(entry: CatalogEntry) {
		if (installingUrl) {
			return;
		}
		const rows = toRows();
		if (rows.some((row) => row.url === entry.transportUrl)) {
			toast.info("That addon is already installed.");
			return;
		}
		installingUrl = entry.transportUrl;
		try {
			const result = await previewAddon(entry.transportUrl).catch(() => null);
			if (!result?.ok) {
				toast.error(`Couldn't reach ${entry.manifest.name}.`);
				return;
			}
			await persist([
				...rows,
				{ url: result.baseUrl, name: result.manifest.name, enabled: true },
			]);
			toast.success(`Added ${result.manifest.name}.`);
		} finally {
			installingUrl = null;
		}
	}
</script>

<div class="flex flex-col gap-6">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold tracking-tight">Addons</h1>
      <p class="text-sm text-muted-foreground">
        Catalogs, metadata, streams and subtitles for this profile.
      </p>
    </div>
    <Button onclick={() => (dialogOpen = true)}>
      <PlusIcon data-icon="inline-start" />
      Add addon
    </Button>
  </div>

  <Alert.Root>
    <InfoIcon />
    <Alert.Description>
      Nuvio Web hosts nothing. Everything you see comes from the addons you
      install : you choose them and are responsible for what they return. Only
      add addons you have the right to use.
    </Alert.Description>
  </Alert.Root>

  {#if addonsQuery.error}
    <Alert.Root variant="destructive">
      <TriangleAlertIcon />
      <Alert.Description
        >Couldn't load your addons. Reload to try again.</Alert.Description
      >
    </Alert.Root>
  {:else if !addonsQuery.current}
    <div class="flex flex-col gap-3">
      {#each { length: 3 } as _, i (i)}
        <div class="skeleton h-24 rounded-xl"></div>
      {/each}
    </div>
  {:else}
    {#if addonsQuery.current.errors.length > 0}
      <Alert.Root variant="destructive">
        <TriangleAlertIcon />
        <Alert.Description>
          {addonsQuery.current.errors.length} addon(s) couldn't be reached:
          {addonsQuery.current.errors.map((entry) => entry.url).join(", ")}
        </Alert.Description>
      </Alert.Root>
    {/if}

    {#if addonsQuery.current.addons.length === 0}
      <Card.Root>
        <Card.Header>
          <Card.Title>No addons yet</Card.Title>
          <Card.Description>
            Start with a metadata provider : catalogs, posters and details. Add
            a stream provider yourself once you're set up.
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-col gap-2">
          {#each SUGGESTED as entry (entry.url)}
            <div
              class="flex items-center gap-3 rounded-lg border border-border/60 p-3"
            >
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium">{entry.name}</p>
                <p class="truncate text-xs text-muted-foreground">
                  {entry.blurb}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onclick={() => addSuggested(entry)}
              >
                <PlusIcon data-icon="inline-start" /> Add
              </Button>
            </div>
          {/each}
        </Card.Content>
      </Card.Root>
    {:else}
      <div class="flex flex-col gap-3">
        {#each addonsQuery.current.addons as addon, index (addon.url)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            ondragover={(event) => {
              if (dragUrl) {
                event.preventDefault();
                dropUrl = addon.url;
              }
            }}
            ondrop={(event) => {
              event.preventDefault();
              onDrop();
            }}
          >
            <Card.Root
              class={cn(
                addon.enabled ? "" : "opacity-60",
                dragUrl === addon.url && "opacity-40",
                dropUrl === addon.url &&
                  dragUrl !== addon.url &&
                  "ring-2 ring-primary",
              )}
            >
              <Card.Content class="flex items-center gap-4 py-4">
                <button
                  type="button"
                  aria-label="Drag to reorder"
                  class="hidden shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing sm:block"
                  draggable="true"
                  ondragstart={() => (dragUrl = addon.url)}
                  ondragend={() => {
                    dragUrl = null;
                    dropUrl = null;
                  }}
                >
                  <GripVerticalIcon class="size-4" />
                </button>
                <div
                  class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
                >
                  {#if addon.logo}
                    <img
                      src={addon.logo}
                      alt=""
                      class="size-full object-cover"
                    />
                  {:else}
                    <PuzzleIcon class="size-5 text-muted-foreground" />
                  {/if}
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate font-medium">{addon.name}</span>
                    {#if !addon.enabled}
                      <Badge variant="outline">Disabled</Badge>
                    {/if}
                    {#if !addon.reachable}
                      <Badge variant="secondary">unreachable</Badge>
                    {/if}
                  </div>
                  {#if addon.description}
                    <p class="truncate text-sm text-muted-foreground">
                      {addon.description}
                    </p>
                  {/if}
                  <div class="mt-1 flex flex-wrap gap-1">
                    {#each addon.resources as resource (resource)}
                      <Badge variant="secondary" class="text-[10px]"
                        >{resource}</Badge
                      >
                    {/each}
                    {#if addon.catalogCount > 0}
                      <Badge variant="secondary" class="text-[10px]"
                        >{addon.catalogCount} catalogs</Badge
                      >
                    {/if}
                  </div>
                </div>

                <div class="flex items-center gap-1">
                  {#if addon.configureUrl}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      href={addon.configureUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Configure ${addon.name}`}
                      title="Open this addon's configuration page"
                    >
                      <SettingsIcon />
                    </Button>
                  {/if}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0 || saving}
                    aria-label="Move up"
                    onclick={() => move(addon.url, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === addonsQuery.current.addons.length - 1 ||
                      saving}
                    aria-label="Move down"
                    onclick={() => move(addon.url, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant={addon.enabled ? "secondary" : "outline"}
                    size="sm"
                    disabled={saving}
                    aria-pressed={addon.enabled}
                    aria-label={addon.enabled
                      ? `Disable ${addon.name}`
                      : `Enable ${addon.name}`}
                    class="w-20"
                    onclick={() => setEnabled(addon.url, !addon.enabled)}
                  >
                    {#if addon.enabled}
                      <PowerIcon data-icon="inline-start" /> On
                    {:else}
                      <PowerOffIcon data-icon="inline-start" /> Off
                    {/if}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={saving}
                    aria-label="Remove"
                    onclick={() =>
                      (confirmRemove = {
                        url: addon.url,
                        name: addon.name ?? addon.url,
                      })}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </Card.Content>
            </Card.Root>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if (catalogSourcesQuery.current?.length ?? 0) > 0}
    <Card.Root>
      <Card.Header>
        <Card.Title>Discover more addons</Card.Title>
        <Card.Description>
          These addons list other addons : browse each directory and install
          what you want.
        </Card.Description>
      </Card.Header>
      <Card.Content class="flex flex-col gap-2">
        {#each catalogSourcesQuery.current ?? [] as source (`${source.addonId}|${source.type}|${source.id}`)}
          <div
            class="flex items-center gap-3 rounded-lg border border-border/60 p-3"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{source.name}</p>
              <p class="truncate text-xs text-muted-foreground">
                From {source.addonName}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onclick={() => openBrowse(source)}
            >
              <CompassIcon data-icon="inline-start" /> Browse
            </Button>
          </div>
        {/each}
      </Card.Content>
    </Card.Root>
  {/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Add addon</Dialog.Title>
      <Dialog.Description
        >Paste a Stremio addon manifest URL.</Dialog.Description
      >
    </Dialog.Header>

    <Field.FieldGroup>
      <Field.Field>
        <Field.FieldLabel for="addon-url">Addon URL</Field.FieldLabel>
        <Input
          id="addon-url"
          bind:value={addUrl}
          placeholder="https://v3-cinemeta.strem.io/manifest.json"
          onkeydown={(event) => event.key === "Enter" && addAddon()}
        />
      </Field.Field>

      {#if preview && !preview.ok}
        <Alert.Root variant="destructive">
          <TriangleAlertIcon />
          <Alert.Description>{preview.message}</Alert.Description>
        </Alert.Root>
      {/if}

      {#if preview?.ok}
        <Card.Root>
          <Card.Content class="flex items-center gap-3 py-4">
            <div
              class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
            >
              {#if preview.manifest.logo}
                <img
                  src={preview.manifest.logo}
                  alt=""
                  class="size-full object-cover"
                />
              {:else}
                <PuzzleIcon class="size-5 text-muted-foreground" />
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{preview.manifest.name}</p>
              {#if preview.manifest.description}
                <p class="truncate text-sm text-muted-foreground">
                  {preview.manifest.description}
                </p>
              {/if}
              <div class="mt-1 flex flex-wrap gap-1">
                {#each preview.manifest.resources as resource (resource)}
                  <Badge variant="secondary" class="text-[10px]"
                    >{resource}</Badge
                  >
                {/each}
              </div>
            </div>
          </Card.Content>
          {#if preview.manifest.catalogs.length > 0}
            <Card.Footer
              class="flex-col items-start gap-1.5 border-t border-border/60 pt-3"
            >
              <p class="text-xs font-medium text-muted-foreground">
                {preview.manifest.catalogCount} catalog{preview.manifest
                  .catalogCount === 1
                  ? ""
                  : "s"}
              </p>
              <div class="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {#each preview.manifest.catalogs as catalog (catalog.type + catalog.name)}
                  <Badge variant="outline" class="text-[10px]">
                    {catalog.name}
                    <span class="ml-1 text-muted-foreground"
                      >{catalog.type}</span
                    >
                  </Badge>
                {/each}
              </div>
            </Card.Footer>
          {/if}
        </Card.Root>
      {/if}
    </Field.FieldGroup>

    <Dialog.Footer class="mt-4">
      <Button variant="ghost" onclick={() => (dialogOpen = false)}
        >Cancel</Button
      >
      <Button disabled={!addUrl || previewing || saving} onclick={addAddon}>
        {#if previewing || saving}<Spinner data-icon="inline-start" />{/if}
        Add addon
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root
  open={confirmRemove !== null}
  onOpenChange={(open) => !open && (confirmRemove = null)}
>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Remove {confirmRemove?.name}?</Dialog.Title>
      <Dialog.Description>
        Its catalogs, metadata and streams stop appearing across the app. You
        can add it back any time.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="mt-4">
      <Button variant="ghost" onclick={() => (confirmRemove = null)}
        >Cancel</Button
      >
      <Button
        variant="destructive"
        disabled={saving}
        onclick={() => confirmRemove && removeAddon(confirmRemove.url)}
      >
        Remove
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={browseOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{browseSource?.name ?? "Browse addons"}</Dialog.Title>
      <Dialog.Description>
        From {browseSource?.addonName}. Installing re-checks each manifest
        before adding it.
      </Dialog.Description>
    </Dialog.Header>

    {#if browseQuery?.error}
      <Alert.Root variant="destructive">
        <TriangleAlertIcon />
        <Alert.Description>Couldn't load this directory.</Alert.Description>
      </Alert.Root>
    {:else if !browseQuery?.current}
      <div class="flex flex-col gap-2">
        {#each { length: 3 } as _, i (i)}
          <div class="skeleton h-16 rounded-lg"></div>
        {/each}
      </div>
    {:else if browseQuery.current.addons.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">
        This directory is empty right now.
      </p>
    {:else}
      <div class="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {#each browseQuery.current.addons as entry (entry.transportUrl)}
          <div
            class="flex items-center gap-3 rounded-lg border border-border/60 p-3"
          >
            <div
              class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
            >
              {#if entry.manifest.logo}
                <img
                  src={entry.manifest.logo}
                  alt=""
                  class="size-full object-cover"
                />
              {:else}
                <PuzzleIcon class="size-5 text-muted-foreground" />
              {/if}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{entry.manifest.name}</p>
              {#if entry.manifest.description}
                <p class="truncate text-xs text-muted-foreground">
                  {entry.manifest.description}
                </p>
              {/if}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={installingUrl !== null}
              onclick={() => installFromCatalog(entry)}
            >
              {#if installingUrl === entry.transportUrl}
                <Spinner data-icon="inline-start" />
              {:else}
                <PlusIcon data-icon="inline-start" />
              {/if}
              Install
            </Button>
          </div>
        {/each}
      </div>
    {/if}

    <Dialog.Footer class="mt-4">
      <Button variant="ghost" onclick={() => (browseOpen = false)}>Close</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
