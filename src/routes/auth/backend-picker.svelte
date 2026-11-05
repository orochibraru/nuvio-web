<script lang="ts">
	import { onMount } from "svelte";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { m } from "#lib/i18n/index.js";
	import type { RemoteFormField } from "$app/server";

	let {
		url,
		publishableKey,
		customAllowed,
		defaultHost,
		officialUrl,
	}: {
		url: RemoteFormField<string>;
		publishableKey: RemoteFormField<string>;
		customAllowed: boolean;
		defaultHost: string | null;
		officialUrl: string;
	} = $props();

	type Choice = "default" | "official" | "custom";

	const STORAGE_KEY = "nuvio:backend:v2";

	const choices = $derived<Choice[]>([
		...(defaultHost ? (["default"] as const) : []),
		"official",
		...(customAllowed ? (["custom"] as const) : []),
	]);
	let choice = $state<Choice>("official");
	let custom = $state({ url: "", key: "" });

	const urlIssue = $derived(url.issues()?.[0]?.message);
	const keyIssue = $derived(publishableKey.issues()?.[0]?.message);

	// An empty URL is the instance default, which is the official API when the
	// admin set none.
	const sentUrl = $derived(
		choice === "official" && defaultHost ? officialUrl : "",
	);

	function choose(next: Choice) {
		if (choice === "custom") {
			custom = {
				url: String(url.value() ?? ""),
				key: String(publishableKey.value() ?? ""),
			};
		}
		choice = next;
		if (next === "custom") {
			url.set(custom.url);
			publishableKey.set(custom.key);
		}
		save();
	}

	function save() {
		try {
			if (choice === "custom") {
				custom = {
					url: String(url.value() ?? ""),
					key: String(publishableKey.value() ?? ""),
				};
			}
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, ...custom }));
		} catch {
			// storage unavailable: the choice just isn't remembered
		}
	}

	onMount(() => {
		choice = choices[0];
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
			if (typeof saved?.url === "string" && typeof saved?.key === "string") {
				custom = { url: saved.url, key: saved.key };
			}
			if (choices.includes(saved?.choice)) {
				choose(saved.choice);
			}
		} catch {
			// storage unavailable or unreadable: the first choice it is
		}
	});

	const optionClass =
		"flex cursor-pointer items-start gap-3 rounded-lg border border-foreground/10 p-3 has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";
</script>

<!-- The radios have no `name` on purpose: the remote form throws on a named
     field it didn't create, and skips unnamed ones. `choice` checks them. -->
{#if choices.length > 1}
	<fieldset class="flex flex-col gap-2" data-testid="backend-picker">
		<legend class="mb-2 text-sm font-medium">{m.auth_backend_choice()}</legend>
		{#if defaultHost}
			<label class={optionClass}>
				<input
					type="radio"
					class="mt-1 accent-primary"
					checked={choice === "default"}
					onchange={() => choose("default")}
				>
				<span class="flex flex-col">
					<span class="text-sm font-medium">{defaultHost}</span>
					<span class="text-xs text-muted-foreground">{m.auth_backend_instance()}</span>
				</span>
			</label>
		{/if}
		<label class={optionClass}>
			<input
				type="radio"
				class="mt-1 accent-primary"
				checked={choice === "official"}
				onchange={() => choose("official")}
			>
			<span class="flex flex-col">
				<span class="text-sm font-medium">Nuvio</span>
				<span class="text-xs text-muted-foreground">{m.auth_backend_official()}</span>
			</span>
		</label>
		{#if customAllowed}
			<label class={optionClass}>
				<input
					type="radio"
					class="mt-1 accent-primary"
					checked={choice === "custom"}
					onchange={() => choose("custom")}
				>
				<span class="flex flex-col">
					<span class="text-sm font-medium">{m.auth_backend()}</span>
					<span class="text-xs text-muted-foreground">{m.auth_backend_description()}</span>
				</span>
			</label>
		{/if}
	</fieldset>
{/if}

{#if choice === "custom"}
	<Field.Field data-invalid={urlIssue ? true : undefined}>
		<Field.FieldLabel for="backend-url">{m.auth_backend_url()}</Field.FieldLabel>
		<Input
			id="backend-url"
			{...url.as('text')}
			oninput={save}
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
			{...publishableKey.as('text')}
			oninput={save}
			autocomplete="off"
			spellcheck="false"
		/>
		{#if keyIssue}
			<Field.FieldError>{keyIssue}</Field.FieldError>
		{:else}
			<Field.FieldDescription>{m.auth_backend_key_hint()}</Field.FieldDescription>
		{/if}
	</Field.Field>
{:else}
	<input {...url.as('hidden', sentUrl)}>
	<input {...publishableKey.as('hidden', '')}>
{/if}
