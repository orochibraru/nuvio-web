<script lang="ts">
	import ServerIcon from "@lucide/svelte/icons/server";
	import { onMount } from "svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { m } from "#lib/i18n/index.js";
	import type { RemoteFormField } from "$app/server";

	let {
		url,
		publishableKey,
		allowed,
		defaultHost,
	}: {
		url: RemoteFormField<string>;
		publishableKey: RemoteFormField<string>;
		allowed: boolean;
		defaultHost: string | null;
	} = $props();

	const STORAGE_KEY = "nuvio:custom-backend:v1";

	const urlIssue = $derived(url.issues()?.[0]?.message);
	const keyIssue = $derived(publishableKey.issues()?.[0]?.message);
	const typedHost = $derived.by(() => {
		try {
			return new URL(String(url.value() ?? "")).host || null;
		} catch {
			return null;
		}
	});
	const host = $derived((allowed ? typedHost : null) ?? defaultHost);

	onMount(() => {
		if (!allowed) {
			return;
		}
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
			if (typeof saved?.url === "string" && typeof saved?.key === "string") {
				url.set(saved.url);
				publishableKey.set(saved.key);
			}
		} catch {
			// storage unavailable or unreadable: the instance default it is
		}
	});

	function save() {
		try {
			const value = {
				url: String(url.value() ?? ""),
				key: String(publishableKey.value() ?? ""),
			};
			if (value.url || value.key) {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		} catch {
			// storage unavailable: the choice just isn't remembered
		}
	}

	function reset() {
		url.set("");
		publishableKey.set("");
		save();
	}
</script>

{#if host}
	<p class="flex items-center gap-2 text-xs text-muted-foreground" data-testid="backend-target">
		<ServerIcon class="size-3.5 shrink-0" />
		{m.auth_backend_using({ host })}
	</p>
{/if}

{#if allowed}
	<details class="group rounded-lg border border-foreground/10 p-3" open={Boolean(urlIssue || keyIssue)}>
		<summary class="cursor-pointer text-sm font-medium">{m.auth_backend()}</summary>
		<div class="mt-3 flex flex-col gap-4">
			<p class="text-xs text-muted-foreground">{m.auth_backend_description()}</p>
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
			<Button type="button" variant="outline" size="sm" onclick={reset}>
				{m.auth_backend_reset()}
			</Button>
		</div>
	</details>
{/if}
