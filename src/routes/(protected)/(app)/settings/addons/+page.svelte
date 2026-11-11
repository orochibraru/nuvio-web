<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import CompassIcon from "@lucide/svelte/icons/compass";
	import GripVerticalIcon from "@lucide/svelte/icons/grip-vertical";
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PowerIcon from "@lucide/svelte/icons/power";
	import PowerOffIcon from "@lucide/svelte/icons/power-off";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import UsersIcon from "@lucide/svelte/icons/users";
	import { toast } from "svelte-sonner";
	import {
		installedAddons,
		previewAddon,
		saveAddons,
	} from "#lib/addons/addons.remote.js";
	import AddonLogo from "#lib/addons/components/addon-logo.svelte";
	import { installedAddonId } from "#lib/addons/directory.js";
	import { failureText } from "#lib/addons/labels.js";
	import NavGroup from "#lib/components/layout/nav-group.svelte";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import SettingsGroup from "#lib/settings/components/settings-group.svelte";
	import { cn } from "#lib/utils.js";
	import { resolve } from "$app/paths";

	pageTitle.set(m.settings_section_addons());

	interface Row {
		url: string;
		name: string;
		enabled: boolean;
	}

	const addonsQuery = installedAddons();
	// The main profile's list: read here, changed from there.
	const sharedFrom = $derived(addonsQuery.current?.sharedFrom ?? null);

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
			toast.error(m.settings_addons_save_failed());
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
		toast.success(m.settings_addons_removed());
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
			preview = { ok: false, message: m.settings_addons_invalid_url() };
		} finally {
			previewing = false;
		}
		const current = preview;
		if (!current?.ok) {
			return;
		}
		const rows = toRows();
		if (rows.some((row) => row.url === current.baseUrl)) {
			toast.info(m.settings_addons_already_installed());
			dialogOpen = false;
			return;
		}
		await persist([
			...rows,
			{
				url: current.baseUrl,
				name: current.manifest.name,
				enabled: true,
			},
		]);
		toast.success(m.settings_addons_added({ name: current.manifest.name }));
		dialogOpen = false;
		addUrl = "";
		preview = null;
	}

	// Metadata-only providers : safe to suggest (no scraper / torrent sources).
	const SUGGESTED = [
		{
			name: "Cinemeta",
			url: "https://v3-cinemeta.strem.io/manifest.json",
			blurb: m.settings_addons_blurb_cinemeta(),
		},
		{
			name: "TMDB",
			url: "https://94c8cb9f702d-tmdb-addon.baby-beamup.club/manifest.json",
			blurb: m.settings_addons_blurb_tmdb(),
		},
	];

	let addingSuggested = $state<string | null>(null);

	async function addSuggested(entry: (typeof SUGGESTED)[number]) {
		if (addingSuggested) {
			return;
		}
		const rows = toRows();
		if (rows.some((row) => `${row.url}/manifest.json` === entry.url)) {
			toast.info(m.settings_addons_already_installed());
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
			toast.error(m.settings_addons_unreachable_named({ name: entry.name }));
			return;
		}
		await persist([
			...rows,
			{ url: result.baseUrl, name: result.manifest.name, enabled: true },
		]);
		toast.success(m.settings_addons_added({ name: result.manifest.name }));
	}

	/** Host only: an addon URL's path often carries a debrid or API key. */
	function addonHost(url: string): string {
		try {
			return new URL(url).host;
		} catch {
			return m.settings_addons_invalid_host();
		}
	}
</script>

{#snippet addButton()}
    <Button size="sm" onclick={() => (dialogOpen = true)}>
        <PlusIcon data-icon="inline-start" />
        {m.settings_addons_add()}
    </Button>
{/snippet}

<div class="flex flex-col gap-8">
    <NavGroup
        rows={[
            {
                href: resolve("addons"),
                label: m.settings_addons_browse_title(),
                description: m.addons_browse_description(),
                icon: CompassIcon,
            },
        ]}
    />

    <SettingsGroup
        title={m.settings_group_installed()}
        action={sharedFrom ? undefined : addButton}
        plain
    >
            <Alert.Root>
                <InfoIcon />
                <Alert.Description>
                    {m.settings_addons_disclaimer()}
                </Alert.Description>
            </Alert.Root>

            {#if addonsQuery.error}
                <Alert.Root variant="destructive">
                    <TriangleAlertIcon />
                    <Alert.Description
                        >{m.settings_addons_load_failed()}</Alert.Description
                    >
                </Alert.Root>
            {:else if !addonsQuery.current}
                <div class="flex flex-col gap-3">
                    {#each { length: 3 } as _, i (i)}
                        <div class="skeleton h-24 rounded-xl"></div>
                    {/each}
                </div>
            {:else}
                {#if sharedFrom}
                    <Alert.Root>
                        <UsersIcon />
                        <Alert.Description>
                            {m.settings_addons_shared({ name: sharedFrom })}
                        </Alert.Description>
                    </Alert.Root>
                {/if}

                {#if addonsQuery.current.errors.length > 0}
                    <Alert.Root variant="destructive">
                        <TriangleAlertIcon />
                        <Alert.Description>
                            {m.settings_addons_errors({
                                count: addonsQuery.current.errors.length,
                            })}
                            <ul class="mt-1 list-disc pl-5">
                                {#each addonsQuery.current.errors as entry (entry.url)}
                                    <li>{addonHost(entry.url)}: {failureText(entry.reason)}</li>
                                {/each}
                            </ul>
                        </Alert.Description>
                    </Alert.Root>
                {/if}

                {#if addonsQuery.current.addons.length === 0 && !sharedFrom}
                    <Card.Root>
                        <Card.Header>
                            <Card.Title>{m.settings_addons_empty_title()}</Card.Title>
                            <Card.Description>
                                {m.settings_addons_empty_description()}
                            </Card.Description>
                        </Card.Header>
                        <Card.Content class="flex flex-col gap-2">
                            {#each SUGGESTED as entry (entry.url)}
                                <div
                                    class="flex items-center gap-3 rounded-lg border border-border/60 p-3"
                                >
                                    <div class="min-w-0 flex-1">
                                        <p class="text-sm font-medium">
                                            {entry.name}
                                        </p>
                                        <p
                                            class="truncate text-xs text-muted-foreground"
                                        >
                                            {entry.blurb}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={saving}
                                        onclick={() => addSuggested(entry)}
                                    >
                                        <PlusIcon data-icon="inline-start" /> {m.common_add()}
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
                                    <Card.Content
                                        class="flex flex-wrap items-center gap-x-4 gap-y-3 py-4"
                                    >
                                        <button
                                            type="button"
                                            aria-label={m.settings_addons_drag()}
                                            class="hidden shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing sm:block"
                                            draggable="true"
                                            ondragstart={() =>
                                                (dragUrl = addon.url)}
                                            ondragend={() => {
                                                dragUrl = null;
                                                dropUrl = null;
                                            }}
                                        >
                                            <GripVerticalIcon class="size-4" />
                                        </button>
                                        <AddonLogo src={addon.logo} class="rounded-md" />

                                        <div class="min-w-0 flex-1">
                                            <div
                                                class="flex items-center gap-2"
                                            >
                                                <a
                                                    href={resolve(`addons/${installedAddonId(addon.url)}`)}
                                                    class="truncate font-medium hover:underline"
                                                    >{addon.name}</a
                                                >
                                                {#if !addon.enabled}
                                                    <Badge variant="outline"
                                                        >{m.settings_addons_disabled()}</Badge
                                                    >
                                                {/if}
                                                {#if !addon.reachable}
                                                    <Badge variant="secondary"
                                                        >{m.settings_addons_unreachable()}</Badge
                                                    >
                                                {/if}
                                            </div>
                                            {#if addon.description}
                                                <p
                                                    class="truncate text-sm text-muted-foreground"
                                                >
                                                    {addon.description}
                                                </p>
                                            {/if}
                                            <div
                                                class="mt-1 flex flex-wrap gap-1"
                                            >
                                                {#each addon.resources as resource (resource)}
                                                    <Badge
                                                        variant="secondary"
                                                        class="text-[10px]"
                                                        >{resource}</Badge
                                                    >
                                                {/each}
                                                {#if addon.catalogCount > 0}
                                                    <Badge
                                                        variant="secondary"
                                                        class="text-[10px]"
                                                        >{m.settings_addons_catalog_count({
                                                            count: addon.catalogCount,
                                                        })}</Badge
                                                    >
                                                {/if}
                                            </div>
                                        </div>

                                        {#if !sharedFrom}
                                        <div
                                            class="ml-auto flex items-center gap-1 max-sm:basis-full max-sm:justify-end"
                                        >
                                            {#if addon.configureUrl}
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    href={addon.configureUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    aria-label={m.settings_addons_configure({ name: addon.name })}
                                                    title={m.settings_addons_configure_title()}
                                                >
                                                    <SettingsIcon />
                                                </Button>
                                            {/if}
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                disabled={index === 0 || saving}
                                                aria-label={m.settings_move_up()}
                                                onclick={() =>
                                                    move(addon.url, -1)}
                                            >
                                                <ArrowUpIcon />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                disabled={index ===
                                                    addonsQuery.current.addons
                                                        .length -
                                                        1 || saving}
                                                aria-label={m.settings_move_down()}
                                                onclick={() =>
                                                    move(addon.url, 1)}
                                            >
                                                <ArrowDownIcon />
                                            </Button>
                                            <Button
                                                variant={addon.enabled
                                                    ? "secondary"
                                                    : "outline"}
                                                size="sm"
                                                disabled={saving}
                                                aria-pressed={addon.enabled}
                                                aria-label={addon.enabled
                                                    ? m.settings_addons_disable({ name: addon.name })
                                                    : m.settings_addons_enable({ name: addon.name })}
                                                class="w-20"
                                                onclick={() =>
                                                    setEnabled(
                                                        addon.url,
                                                        !addon.enabled,
                                                    )}
                                            >
                                                {#if addon.enabled}
                                                    <PowerIcon
                                                        data-icon="inline-start"
                                                    /> {m.settings_addons_on()}
                                                {:else}
                                                    <PowerOffIcon
                                                        data-icon="inline-start"
                                                    /> {m.settings_addons_off()}
                                                {/if}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                disabled={saving}
                                                aria-label={m.common_remove()}
                                                onclick={() =>
                                                    (confirmRemove = {
                                                        url: addon.url,
                                                        name:
                                                            addon.name ??
                                                            addon.url,
                                                    })}
                                            >
                                                <Trash2Icon />
                                            </Button>
                                        </div>
                                        {/if}
                                    </Card.Content>
                                </Card.Root>
                            </div>
                        {/each}
                    </div>
                {/if}
            {/if}

    </SettingsGroup>

</div>

<Dialog.Root bind:open={dialogOpen}>
    <Dialog.Content class="sm:max-w-lg">
        <Dialog.Header>
            <Dialog.Title>{m.settings_addons_add()}</Dialog.Title>
            <Dialog.Description
                >{m.settings_addons_dialog_description()}</Dialog.Description
            >
        </Dialog.Header>

        <Field.FieldGroup>
            <Field.Field>
                <Field.FieldLabel for="addon-url"
                    >{m.settings_addons_url_label()}</Field.FieldLabel
                >
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
                        <AddonLogo src={preview.manifest.logo} class="rounded-md" />
                        <div class="min-w-0 flex-1">
                            <p class="truncate font-medium">
                                {preview.manifest.name}
                            </p>
                            {#if preview.manifest.description}
                                <p
                                    class="truncate text-sm text-muted-foreground"
                                >
                                    {preview.manifest.description}
                                </p>
                            {/if}
                            <div class="mt-1 flex flex-wrap gap-1">
                                {#each preview.manifest.resources as resource (resource)}
                                    <Badge
                                        variant="secondary"
                                        class="text-[10px]">{resource}</Badge
                                    >
                                {/each}
                            </div>
                        </div>
                    </Card.Content>
                    {#if preview.manifest.catalogs.length > 0}
                        <Card.Footer
                            class="flex-col items-start gap-1.5 border-t border-border/60 pt-3"
                        >
                            <p
                                class="text-xs font-medium text-muted-foreground"
                            >
                                {m.settings_addons_catalog_count_exact({
                                    count: preview.manifest.catalogCount,
                                })}
                            </p>
                            <div
                                class="flex max-h-24 flex-wrap gap-1 overflow-y-auto"
                            >
                                {#each preview.manifest.catalogs as catalog (`${catalog.type}|${catalog.id}`)}
                                    <Badge
                                        variant="outline"
                                        class="text-[10px]"
                                    >
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
                >{m.common_cancel()}</Button
            >
            <Button
                disabled={!addUrl || previewing || saving}
                onclick={addAddon}
            >
                {#if previewing || saving}<Spinner
                        data-icon="inline-start"
                    />{/if}
                {m.settings_addons_add()}
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
            <Dialog.Title
                >{m.settings_addons_remove_title({
                    name: confirmRemove?.name ?? "",
                })}</Dialog.Title
            >
            <Dialog.Description>
                {m.settings_addons_remove_description()}
            </Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer class="mt-4">
            <Button variant="ghost" onclick={() => (confirmRemove = null)}
                >{m.common_cancel()}</Button
            >
            <Button
                variant="destructive"
                disabled={saving}
                onclick={() => confirmRemove && removeAddon(confirmRemove.url)}
            >
                {m.common_remove()}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
