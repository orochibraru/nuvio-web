<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
	import { toast } from "svelte-sonner";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import {
		catalogKey,
		catalogTitles,
		DEFAULT_HOME_ROWS,
		EMPTY_HOME_LAYOUT,
		type HomeLayout,
		homeCatalogs,
		isCustomized,
		moveCatalog,
		orderCatalogs,
		setHidden,
	} from "#lib/settings/home-layout.js";
	import { saveHomeLayout } from "#lib/settings/settings.remote.js";

	interface Catalog {
		addonId: string;
		addonName: string;
		type: string;
		id: string;
		name: string;
	}

	let {
		layout: layoutPromise,
		catalogs: catalogsPromise,
	}: { layout: Promise<HomeLayout>; catalogs: Promise<Catalog[]> } = $props();

	const layoutStream = streamed(() => layoutPromise, EMPTY_HOME_LAYOUT);
	const catalogsStream = streamed(() => catalogsPromise, [] as Catalog[]);

	// Edits apply here first and save in the background; a failed save rolls
	// back to the last saved layout.
	let draft = $state<HomeLayout | null>(null);
	let saving = $state(false);
	const layout = $derived(draft ?? layoutStream.current);
	const ordered = $derived(orderCatalogs(catalogsStream.current, layout));
	// Labelled the way Home labels its rows ("Popular movies"), across every
	// catalog, so the list and the home screen read the same.
	const titles = $derived(
		catalogTitles(ordered.map((c) => ({ title: c.name, type: c.type }))),
	);
	const hidden = $derived(new Set(layout.hidden_catalogs));
	const shown = $derived(
		new Set(homeCatalogs(catalogsStream.current, layout).map(catalogKey)),
	);
	const loading = $derived(!(layoutStream.ready && catalogsStream.ready));

	async function apply(next: HomeLayout) {
		const previous = layout;
		draft = next;
		saving = true;
		try {
			await saveHomeLayout(next);
		} catch {
			draft = previous;
			toast.error(m.settings_home_save_failed());
		} finally {
			saving = false;
		}
	}

	const typeLabel = (type: string) =>
		type === "series"
			? m.common_series()
			: type === "movie"
				? m.common_movies()
				: type;
</script>

<Card.Root class="border border-foreground/10">
  <Card.Header>
    <Card.Title role="heading" aria-level={2}>{m.nav_home()}</Card.Title>
    <Card.Description>
      {m.settings_home_description()}
    </Card.Description>
    {#if isCustomized(layout)}
      <Card.Action>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onclick={() => apply(EMPTY_HOME_LAYOUT)}
        >
          <RotateCcwIcon data-icon="inline-start" />{m.settings_home_reset()}
        </Button>
      </Card.Action>
    {/if}
  </Card.Header>
  <Card.Content>
    {#if loading}
      <div class="flex flex-col gap-2" aria-hidden="true">
        {#each { length: 5 } as _row, index (index)}
          <div class="skeleton h-12 rounded-lg"></div>
        {/each}
      </div>
    {:else if ordered.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">
        {m.settings_home_empty()}
      </p>
    {:else}
      {#if !isCustomized(layout)}
        <p class="mb-3 text-sm text-muted-foreground">
          {m.settings_home_default_hint({ count: DEFAULT_HOME_ROWS })}
        </p>
      {/if}
      <ol class="flex flex-col gap-1.5" aria-label={m.settings_home_list_label()}>
        {#each ordered as catalog, index (catalogKey(catalog))}
          {@const key = catalogKey(catalog)}
          {@const isHidden = hidden.has(key)}
          {@const title = titles[index]}
          <li
            class="flex items-center gap-3 rounded-lg border border-foreground/10 px-3 py-2"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium" class:opacity-50={isHidden}>
                {title}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {typeLabel(catalog.type)} · {catalog.addonName}
                {#if !isHidden && !shown.has(key)}
                  · {m.settings_home_past_limit()}
                {/if}
              </p>
            </div>
            <div class="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.settings_home_move_title_up({ title })}
                title={m.settings_move_up()}
                disabled={index === 0 || saving}
                onclick={() => apply(moveCatalog(catalogsStream.current, layout, key, -1))}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.settings_home_move_title_down({ title })}
                title={m.settings_move_down()}
                disabled={index === ordered.length - 1 || saving}
                onclick={() => apply(moveCatalog(catalogsStream.current, layout, key, 1))}
              >
                <ArrowDownIcon />
              </Button>
              <Switch
                checked={!isHidden}
                aria-label={m.settings_home_show_title({ title })}
                disabled={saving}
                onCheckedChange={(on) => apply(setHidden(layout, key, !on))}
              />
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </Card.Content>
</Card.Root>
