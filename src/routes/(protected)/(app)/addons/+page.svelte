<script lang="ts">
	import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
	import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
	import InfoIcon from "@lucide/svelte/icons/info";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
	import { toast } from "svelte-sonner";
	import {
		installedAddons,
		previewAddon,
		saveAddons,
	} from "$lib/addons/addons.remote";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { Switch } from "$lib/components/ui/switch/index.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";

	pageTitle.set("Addons");

	type Row = { url: string; name: string; enabled: boolean };

	const addonsQuery = installedAddons();

	let saving = $state(false);
	let dialogOpen = $state(false);
	let addUrl = $state("");
	let previewing = $state(false);
	let preview = $state<Awaited<ReturnType<typeof previewAddon>> | null>(null);

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
		persist(
			toRows().map((row) => (row.url === url ? { ...row, enabled } : row)),
		);
	}

	function removeAddon(url: string) {
		persist(toRows().filter((row) => row.url !== url));
	}

	function move(url: string, delta: number) {
		const rows = toRows();
		const index = rows.findIndex((row) => row.url === url);
		const target = index + delta;
		if (index < 0 || target < 0 || target >= rows.length) {
			return;
		}
		[rows[index], rows[target]] = [rows[target], rows[index]];
		persist(rows);
	}

	async function runPreview() {
		previewing = true;
		preview = null;
		try {
			preview = await previewAddon(addUrl);
		} catch {
			preview = { ok: false, message: "Enter a valid addon URL." };
		} finally {
			previewing = false;
		}
	}

	async function confirmAdd() {
		const current = preview;
		if (!current?.ok) {
			return;
		}
		const rows = toRows();
		if (rows.some((row) => row.url === current.baseUrl)) {
			toast.info("That addon is already installed.");
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
			install — you choose them and are responsible for what they return. Only
			add addons you have the right to use.
		</Alert.Description>
	</Alert.Root>

	{#if addonsQuery.error}
		<Alert.Root variant="destructive">
			<TriangleAlertIcon />
			<Alert.Description>Couldn't load your addons. Reload to try again.</Alert.Description>
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
						Add a Stremio-compatible addon to start browsing. Cinemeta
						(<code>https://v3-cinemeta.strem.io</code>) is a good first catalog.
					</Card.Description>
				</Card.Header>
			</Card.Root>
		{:else}
			<div class="flex flex-col gap-3">
				{#each addonsQuery.current.addons as addon, index (addon.url)}
					<Card.Root class={addon.enabled ? "" : "opacity-60"}>
						<Card.Content class="flex items-center gap-4 py-4">
							<div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
								{#if addon.logo}
									<img src={addon.logo} alt="" class="size-full object-contain" />
								{:else}
									<PuzzleIcon class="size-5 text-muted-foreground" />
								{/if}
							</div>

							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="truncate font-medium">{addon.name}</span>
									{#if !addon.reachable}
										<Badge variant="secondary">unreachable</Badge>
									{/if}
								</div>
								{#if addon.description}
									<p class="truncate text-sm text-muted-foreground">{addon.description}</p>
								{/if}
								<div class="mt-1 flex flex-wrap gap-1">
									{#each addon.resources as resource (resource)}
										<Badge variant="secondary" class="text-[10px]">{resource}</Badge>
									{/each}
									{#if addon.catalogCount > 0}
										<Badge variant="secondary" class="text-[10px]">{addon.catalogCount} catalogs</Badge>
									{/if}
								</div>
							</div>

							<div class="flex items-center gap-1">
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
									disabled={index === addonsQuery.current.addons.length - 1 || saving}
									aria-label="Move down"
									onclick={() => move(addon.url, 1)}
								>
									<ArrowDownIcon />
								</Button>
								<Switch
									checked={addon.enabled}
									disabled={saving}
									onCheckedChange={(value) => setEnabled(addon.url, value)}
								/>
								<Button
									variant="ghost"
									size="icon-sm"
									disabled={saving}
									aria-label="Remove"
									onclick={() => removeAddon(addon.url)}
								>
									<Trash2Icon />
								</Button>
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add addon</Dialog.Title>
			<Dialog.Description>Paste a Stremio addon manifest URL.</Dialog.Description>
		</Dialog.Header>

		<Field.FieldGroup>
			<Field.Field>
				<Field.FieldLabel for="addon-url">Addon URL</Field.FieldLabel>
				<div class="flex gap-2">
					<Input
						id="addon-url"
						bind:value={addUrl}
						placeholder="https://v3-cinemeta.strem.io/manifest.json"
						onkeydown={(event) => event.key === "Enter" && runPreview()}
					/>
					<Button variant="secondary" disabled={!addUrl || previewing} onclick={runPreview}>
						{#if previewing}<Spinner data-icon="inline-start" />{/if}
						Check
					</Button>
				</div>
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
						<div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
							{#if preview.manifest.logo}
								<img src={preview.manifest.logo} alt="" class="size-full object-contain" />
							{:else}
								<PuzzleIcon class="size-5 text-muted-foreground" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium">{preview.manifest.name}</p>
							{#if preview.manifest.description}
								<p class="truncate text-sm text-muted-foreground">{preview.manifest.description}</p>
							{/if}
							<div class="mt-1 flex flex-wrap gap-1">
								{#each preview.manifest.resources as resource (resource)}
									<Badge variant="secondary" class="text-[10px]">{resource}</Badge>
								{/each}
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/if}
		</Field.FieldGroup>

		<Dialog.Footer class="mt-4">
			<Button variant="ghost" onclick={() => (dialogOpen = false)}>Cancel</Button>
			<Button disabled={!preview?.ok || saving} onclick={confirmAdd}>
				{#if saving}<Spinner data-icon="inline-start" />{/if}
				Add
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
