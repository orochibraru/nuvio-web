<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import ScaleIcon from "@lucide/svelte/icons/scale";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { toast } from "svelte-sonner";
	import { previewAddon, saveAddons } from "#lib/addons/addons.remote.js";
	import AddonLogo from "#lib/addons/components/addon-logo.svelte";
	import { catalogFeatures, resourceDetails } from "#lib/addons/directory.js";
	import { failureText, resourceLabel, typeLabel } from "#lib/addons/labels.js";
	import EmptyState from "#lib/components/feedback/empty-state.svelte";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { httpUrlOrNull } from "#lib/core/url.js";
	import { m } from "#lib/i18n/index.js";
	import { refreshAll } from "$app/navigation";
	import { resolve } from "$app/paths";

	let { data } = $props();

	type Details = Awaited<typeof data.details>;
	type Rows = NonNullable<Awaited<typeof data.rows>>;

	const detailsStream = streamed(() => data.details, null as Details | null);
	const rowsStream = streamed(() => data.rows, null as Rows | null);

	const details = $derived(detailsStream.current);
	const manifest = $derived(details?.ok ? details.manifest : null);
	const baseUrl = $derived(details?.ok ? details.baseUrl : null);
	const rows = $derived(rowsStream.current);
	const installedRow = $derived(
		baseUrl && rows
			? (rows.find((row) => row.baseUrl === baseUrl) ?? null)
			: null,
	);
	const hints = $derived(manifest?.behaviorHints);
	const configureUrl = $derived(
		baseUrl && (hints?.configurable || hints?.configurationRequired)
			? httpUrlOrNull(`${baseUrl}/configure`)
			: null,
	);
	const manifestUrl = $derived(
		baseUrl ? `${baseUrl}/manifest.json` : (data.url ?? ""),
	);
	const background = $derived(httpUrlOrNull(manifest?.background));
	const resources = $derived(manifest ? resourceDetails(manifest) : []);
	const types = $derived([...new Set(manifest?.types ?? [])]);
	const needsConfiguration = $derived(
		Boolean(hints?.configurationRequired) && !installedRow,
	);

	$effect(() => {
		pageTitle.set(manifest?.name ?? m.settings_addons_browse_title());
	});

	let busy = $state(false);

	function plainRows(list: Rows) {
		return list.map(({ url, name, enabled }) => ({ url, name, enabled }));
	}

	async function install() {
		const url = data.url ?? (baseUrl ? `${baseUrl}/manifest.json` : null);
		if (!(rows && url) || busy) {
			return;
		}
		busy = true;
		try {
			const result = await previewAddon(url).catch(() => null);
			if (!result?.ok) {
				toast.error(result?.message ?? m.settings_addons_preview_unreachable());
				return;
			}
			if (rows.some((row) => row.baseUrl === result.baseUrl)) {
				toast.info(m.settings_addons_already_installed());
				return;
			}
			await saveAddons([
				...plainRows(rows),
				{ url: result.baseUrl, name: result.manifest.name, enabled: true },
			]);
			await refreshAll();
			toast.success(m.settings_addons_added({ name: result.manifest.name }));
		} catch {
			toast.error(m.settings_addons_save_failed());
		} finally {
			busy = false;
		}
	}

	async function restore(previous: ReturnType<typeof plainRows>) {
		try {
			await saveAddons(previous);
			await refreshAll();
		} catch {
			toast.error(m.settings_addons_save_failed());
		}
	}

	async function uninstall() {
		const row = installedRow;
		if (!(rows && row) || busy) {
			return;
		}
		const previous = plainRows(rows);
		const name = manifest?.name ?? row.name ?? row.baseUrl;
		busy = true;
		try {
			await saveAddons(previous.filter((entry) => entry.url !== row.url));
			await refreshAll();
			toast.success(m.addons_uninstalled({ name }), {
				action: {
					label: m.common_undo(),
					onClick: () => void restore(previous),
				},
			});
		} catch {
			toast.error(m.settings_addons_save_failed());
		} finally {
			busy = false;
		}
	}

	async function copyManifestUrl() {
		try {
			await navigator.clipboard.writeText(manifestUrl);
			toast.success(m.common_copied());
		} catch {
			toast.error(m.addons_copy_failed());
		}
	}
</script>

{#snippet section(title: string)}
  <h2 class="px-1 text-xs font-semibold tracking-[0.12em] text-accent-label uppercase">
    {title}
  </h2>
{/snippet}

<div class="flex flex-col gap-6">
  <a
    href={resolve("addons")}
    class="-ml-2 flex w-fit items-center gap-0.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-accent-label transition active:scale-95"
  >
    <ChevronLeftIcon class="size-5" />
    {m.settings_addons_browse_title()}
  </a>

  {#if !detailsStream.ready}
    <div class="skeleton h-56 rounded-3xl"></div>
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="skeleton h-40 rounded-3xl"></div>
      <div class="skeleton h-40 rounded-3xl"></div>
    </div>
  {:else if !details?.ok || !manifest || !baseUrl}
    <EmptyState
      icon={TriangleAlertIcon}
      title={m.addons_details_failed()}
      description={details && !details.ok ? failureText(details.reason) : undefined}
    >
      {#snippet actions()}
        <Button variant="outline" onclick={() => refreshAll()}>{m.common_try_again()}</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <section class="glass relative overflow-hidden rounded-3xl">
      {#if background}
        <img
          src={background}
          alt=""
          class="absolute inset-0 size-full object-cover opacity-20"
        />
        <div
          class="absolute inset-0 bg-linear-to-b from-transparent to-background/80"
        ></div>
      {/if}
      <div class="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-8">
        <AddonLogo src={manifest.logo} class="size-20 rounded-3xl sm:size-24" />
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <div class="flex flex-col gap-1">
            <h1 class="text-3xl font-bold tracking-tight wrap-break-word">{manifest.name}</h1>
            <p class="text-sm break-all text-muted-foreground">
              {m.addons_version({ version: manifest.version })} · {manifest.id}
            </p>
          </div>

          <div class="flex flex-wrap gap-1.5">
            {#if installedRow}
              <Badge>
                <CheckIcon data-icon="inline-start" />
                {m.addons_installed()}
              </Badge>
              {#if !installedRow.enabled}
                <Badge variant="outline">{m.settings_addons_disabled()}</Badge>
              {/if}
            {/if}
            {#if hints?.configurable}
              <Badge variant="secondary">{m.addons_hint_configurable()}</Badge>
            {/if}
            {#if hints?.configurationRequired}
              <Badge variant="secondary">{m.addons_hint_configuration_required()}</Badge>
            {/if}
            {#if hints?.adult}
              <Badge variant="destructive">{m.addons_hint_adult()}</Badge>
            {/if}
            {#if hints?.p2p}
              <Badge variant="destructive">{m.addons_hint_p2p()}</Badge>
            {/if}
          </div>

          {#if manifest.description}
            <p class="max-w-prose text-sm whitespace-pre-line">{manifest.description}</p>
          {/if}

          <div class="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
            {#if installedRow}
              <Button
                variant="outline"
                class="h-11 rounded-full"
                disabled={busy || !rows}
                onclick={uninstall}
              >
                {#if busy}
                  <Spinner data-icon="inline-start" />
                {:else}
                  <Trash2Icon data-icon="inline-start" />
                {/if}
                {m.addons_uninstall()}
              </Button>
            {:else}
              <Button
                class="h-11 rounded-full"
                disabled={busy || !rows || needsConfiguration}
                onclick={install}
              >
                {#if busy}
                  <Spinner data-icon="inline-start" />
                {:else}
                  <PlusIcon data-icon="inline-start" />
                {/if}
                {m.settings_addons_install()}
              </Button>
            {/if}
            {#if configureUrl}
              <Button
                variant={needsConfiguration ? "default" : "outline"}
                class="h-11 rounded-full"
                href={configureUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <SettingsIcon data-icon="inline-start" />
                {m.addons_configure()}
                <ExternalLinkIcon data-icon="inline-end" />
              </Button>
            {/if}
          </div>
        </div>
      </div>
    </section>

    <Alert.Root>
      <ScaleIcon />
      <Alert.Description>{m.addons_legal_rule()}</Alert.Description>
    </Alert.Root>

    {#if rowsStream.ready && !rows}
      <Alert.Root variant="destructive">
        <TriangleAlertIcon />
        <Alert.Description>{m.settings_addons_load_failed()}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if needsConfiguration}
      <Alert.Root>
        <SettingsIcon />
        <Alert.Description>{m.addons_configuration_required_note()}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if hints?.adult}
      <Alert.Root variant="destructive">
        <TriangleAlertIcon />
        <Alert.Description>{m.addons_warning_adult()}</Alert.Description>
      </Alert.Root>
    {/if}
    {#if hints?.p2p}
      <Alert.Root variant="destructive">
        <TriangleAlertIcon />
        <Alert.Description>{m.addons_warning_p2p()}</Alert.Description>
      </Alert.Root>
    {/if}

    <div class="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <section class="flex flex-col gap-2">
        {@render section(m.addons_about())}
        <dl class="glass flex flex-1 flex-col gap-4 rounded-3xl p-5 text-sm">
          <div class="flex flex-col gap-1.5">
            <dt class="text-muted-foreground">{m.addons_types()}</dt>
            <dd class="flex flex-wrap gap-1">
              {#each types as entry (entry)}
                <Badge variant="outline">{typeLabel(entry)}</Badge>
              {:else}
                <span>{m.addons_none()}</span>
              {/each}
            </dd>
          </div>
          {#if manifest.contactEmail}
            <div class="flex flex-col gap-1">
              <dt class="text-muted-foreground">{m.addons_contact()}</dt>
              <dd class="break-all">{manifest.contactEmail}</dd>
            </div>
          {/if}
          <div class="flex flex-col gap-1">
            <dt class="text-muted-foreground">{m.addons_manifest_url()}</dt>
            <dd class="flex items-start gap-2">
              <code class="min-w-0 flex-1 rounded-lg bg-muted px-2 py-1.5 text-xs break-all">
                {manifestUrl}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.addons_copy_manifest_url()}
                title={m.addons_copy_manifest_url()}
                onclick={copyManifestUrl}
              >
                <CopyIcon />
              </Button>
            </dd>
          </div>
        </dl>
      </section>

      <section class="flex flex-col gap-2 2xl:col-span-2">
        {@render section(m.addons_resources())}
        <ul class="glass flex flex-1 flex-col divide-y divide-foreground/8 rounded-3xl text-sm">
          {#each resources as resource, index (index)}
            <li class="flex flex-col gap-1.5 px-5 py-3.5">
              <span class="font-semibold">{resourceLabel(resource.name)}</span>
              <span class="flex flex-wrap items-center gap-1">
                {#each resource.types as entry, typeIndex (typeIndex)}
                  <Badge variant="outline">{typeLabel(entry)}</Badge>
                {:else}
                  <span class="text-muted-foreground">{m.addons_any_type()}</span>
                {/each}
              </span>
              {#if resource.idPrefixes.length > 0}
                <span class="text-xs break-all text-muted-foreground">
                  {m.addons_id_prefixes({ prefixes: resource.idPrefixes.join(", ") })}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    </div>

    <section class="flex flex-col gap-2">
      {@render section(m.settings_addons_catalog_count_exact({ count: manifest.catalogs.length }))}
      {#if manifest.catalogs.length === 0}
        <p class="glass rounded-3xl px-5 py-4 text-sm text-muted-foreground">
          {m.addons_catalogs_none()}
        </p>
      {:else}
        <ul
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1800px]:grid-cols-5 min-[2400px]:grid-cols-6"
        >
          {#each manifest.catalogs as catalog (`${catalog.type}|${catalog.id}`)}
            {@const features = catalogFeatures(catalog)}
            <li class="glass flex flex-col gap-2 rounded-3xl p-4 text-sm">
              <span class="flex items-baseline justify-between gap-2">
                <span class="truncate font-semibold">{catalog.name ?? catalog.id}</span>
                <span class="shrink-0 text-xs text-muted-foreground">{typeLabel(catalog.type)}</span>
              </span>
              <span class="flex flex-wrap gap-1">
                {#if features.search}
                  <Badge variant="secondary">{m.addons_catalog_search()}</Badge>
                {/if}
                {#if features.genre}
                  <Badge variant="secondary">{m.addons_catalog_genre()}</Badge>
                {/if}
                {#each features.required as name (name)}
                  <Badge variant="outline">{m.addons_catalog_requires({ name })}</Badge>
                {/each}
                {#each features.extras as name (name)}
                  <Badge variant="outline">{name}</Badge>
                {/each}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>
