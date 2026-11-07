<script lang="ts">
	import ServerIcon from "@lucide/svelte/icons/server";
	import { onMount } from "svelte";
	import { MediaQuery } from "svelte/reactivity";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import * as Drawer from "#lib/components/ui/drawer/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { m } from "#lib/i18n/index.js";
	import { cn } from "#lib/utils.js";
	import type { RemoteFormField } from "$app/server";
	import { type BackendTarget, targetOf } from "./backend-target.ts";

	let {
		url,
		publishableKey,
		allowed,
		defaultTarget,
		officialUrl,
	}: {
		url: RemoteFormField<string>;
		publishableKey: RemoteFormField<string>;
		allowed: boolean;
		defaultTarget: BackendTarget;
		officialUrl: string;
	} = $props();

	type Choice = "default" | "official" | "custom";

	const STORAGE_KEY = "nuvio:custom-backend:v1";
	const phone = new MediaQuery("max-width: 47.99rem");

	let open = $state(false);
	let choice = $state<Choice>("default");
	let draftUrl = $state("");
	let draftKey = $state("");

	const urlIssue = $derived(url.issues()?.[0]?.message);
	const keyIssue = $derived(publishableKey.issues()?.[0]?.message);
	const target = $derived(
		targetOf(url.value(), defaultTarget, {
			officialUrl,
			customAllowed: allowed,
		}),
	);
	// The official API is always on offer: as the default, or beside the
	// backend an admin put in its place.
	const offersOfficial = $derived(defaultTarget.kind !== "nuvio");
	const changeable = $derived(allowed || offersOfficial);

	function nameOf(value: BackendTarget): string {
		if (value.kind === "nuvio") {
			return "Nuvio";
		}
		return value.kind === "server" ? m.auth_target_server() : value.host;
	}

	onMount(() => {
		if (!changeable) {
			return;
		}
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
			if (typeof saved?.url === "string" && typeof saved?.key === "string") {
				const kind = targetOf(saved.url, defaultTarget, {
					officialUrl,
					customAllowed: allowed,
				}).kind;
				// A remembered choice the admin has since taken away is dropped.
				const usable =
					kind === "nuvio" ? offersOfficial : kind === "other" && allowed;
				if (usable) {
					url.set(saved.url);
					publishableKey.set(saved.key);
				}
			}
		} catch {
			// storage unavailable or unreadable: the instance default it is
		}
	});

	function edit() {
		draftUrl = String(url.value() ?? "");
		draftKey = String(publishableKey.value() ?? "");
		if (!draftUrl) {
			choice = "default";
		} else if (target.kind === "nuvio") {
			choice = "official";
			draftUrl = "";
			draftKey = "";
		} else {
			choice = "custom";
		}
		open = true;
	}

	function apply() {
		const custom = choice === "custom" && draftUrl.trim() !== "";
		let value = { url: "", key: "" };
		if (choice === "official") {
			value = { url: officialUrl, key: "" };
		} else if (custom) {
			value = { url: draftUrl.trim(), key: draftKey.trim() };
		}
		url.set(value.url);
		publishableKey.set(value.key);
		try {
			if (value.url) {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		} catch {
			// storage unavailable: the choice just isn't remembered
		}
		open = false;
	}
</script>

{#snippet option(value: Choice, title: string, hint: string)}
	<label
		class={cn(
			"flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
			choice === value
				? "border-primary bg-primary/10"
				: "border-foreground/10 hover:bg-foreground/5",
		)}
	>
		<input
			type="radio"
			name="backend-choice"
			{value}
			bind:group={choice}
			class="mt-0.5 size-4 accent-primary"
		/>
		<span class="flex min-w-0 flex-col">
			<span class="text-sm font-medium">{title}</span>
			<span class="truncate text-xs text-muted-foreground">{hint}</span>
		</span>
	</label>
{/snippet}

{#snippet body()}
	<div class="flex flex-col gap-3" role="radiogroup" aria-label={m.auth_backend()}>
		{@render option("default", m.auth_backend_default(), nameOf(defaultTarget))}
		{#if offersOfficial}
			{@render option("official", "Nuvio", m.auth_backend_official())}
		{/if}
		{#if allowed}
			{@render option("custom", m.auth_backend_custom(), m.auth_backend_custom_hint())}
		{/if}
	</div>
	{#if choice === "custom"}
		<div class="flex flex-col gap-4">
			<Field.Field data-invalid={urlIssue ? true : undefined}>
				<Field.FieldLabel for="backend-url">{m.auth_backend_url()}</Field.FieldLabel>
				<Input
					id="backend-url"
					bind:value={draftUrl}
					inputmode="url"
					autocomplete="off"
					spellcheck="false"
					placeholder="https://"
				/>
				{#if urlIssue}
					<Field.FieldError>{urlIssue}</Field.FieldError>
				{/if}
			</Field.Field>
			<Field.Field data-invalid={keyIssue ? true : undefined}>
				<Field.FieldLabel for="backend-key">{m.auth_backend_key()}</Field.FieldLabel>
				<Input
					id="backend-key"
					bind:value={draftKey}
					autocomplete="off"
					spellcheck="false"
				/>
				{#if keyIssue}
					<Field.FieldError>{keyIssue}</Field.FieldError>
				{:else}
					<Field.FieldDescription>{m.auth_backend_key_hint()}</Field.FieldDescription>
				{/if}
			</Field.Field>
		</div>
	{/if}
	<p class="text-xs text-muted-foreground">{m.auth_backend_description()}</p>
	<Button class="h-12 w-full rounded-full" onclick={apply}>{m.common_done()}</Button>
{/snippet}

<input {...url.as("hidden", String(url.value() ?? ""))} />
<input {...publishableKey.as("hidden", String(publishableKey.value() ?? ""))} />

<div class="flex flex-col gap-2">
	<div
		class="flex items-center gap-3 rounded-xl bg-foreground/5 px-3 py-2.5"
		data-testid="backend-target"
	>
		<ServerIcon class="size-4 shrink-0 text-muted-foreground" />
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="text-xs text-muted-foreground">{m.auth_target_label()}</span>
			<span class="truncate text-sm font-medium">{nameOf(target)}</span>
		</div>
		{#if changeable}
			<Button type="button" variant="ghost" size="sm" onclick={edit}>
				{m.auth_target_change()}
			</Button>
		{/if}
	</div>
	{#if urlIssue || keyIssue}
		<p class="text-sm text-destructive">{urlIssue ?? keyIssue}</p>
	{/if}
</div>

{#if changeable}
	<!-- The auth screens pin `dark` on their wrapper; a portalled overlay needs it too. -->
	{#if phone.current}
		<Drawer.Root bind:open>
			<Drawer.Content class="dark max-h-[85dvh] text-foreground" data-accent="blue">
				<Drawer.Header>
					<Drawer.Title>{m.auth_backend()}</Drawer.Title>
				</Drawer.Header>
				<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
					{@render body()}
				</div>
			</Drawer.Content>
		</Drawer.Root>
	{:else}
		<Dialog.Root bind:open>
			<Dialog.Content class="dark text-foreground" data-accent="blue">
				<Dialog.Header>
					<Dialog.Title>{m.auth_backend()}</Dialog.Title>
				</Dialog.Header>
				{@render body()}
			</Dialog.Content>
		</Dialog.Root>
	{/if}
{/if}
