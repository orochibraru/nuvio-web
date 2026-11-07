<script lang="ts">
	import CopyIcon from "@lucide/svelte/icons/copy";
	import ServerIcon from "@lucide/svelte/icons/server";
	import { toast } from "svelte-sonner";
	import type { BackendsTabData } from "#lib/admin/backends-data.js";
	import type { BuiltInSummary } from "#lib/backend/handler.js";
	import { Badge } from "#lib/components/ui/badge/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { invalidateAll } from "$app/navigation";
	import { page } from "$app/state";
	import {
		createBuiltInAccount,
		saveDefaultBackend,
		setBackendBan,
		setCustomBackends,
		testDefaultBackend,
		useBuiltInBackend,
	} from "./backends.remote.ts";

	let {
		backends,
		builtIn,
	}: {
		backends: Promise<BackendsTabData>;
		builtIn: Promise<BuiltInSummary | null>;
	} = $props();

	const tab = streamed<BackendsTabData | null>(() => backends, null);
	const own = streamed<BuiltInSummary | null>(() => builtIn, null);

	const passwordIssue = $derived(
		createBuiltInAccount.fields._password.issues()?.[0]?.message,
	);
	const switchIssue = $derived(useBuiltInBackend.fields.issues()?.[0]?.message);

	async function copy(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			toast.success(m.common_copied());
		} catch {
			toast.error(m.admin_builtin_copy_failed());
		}
	}

	const dateTime = new Intl.DateTimeFormat(getLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
	});

	const urlIssue = $derived(
		saveDefaultBackend.fields.url.issues()?.[0]?.message,
	);
	const keyIssue = $derived(
		saveDefaultBackend.fields.publishableKey.issues()?.[0]?.message,
	);

	// Fill the form once with what is saved; after that it is the admin's.
	let seeded = false;
	$effect(() => {
		const current = tab.current;
		if (current && !seeded) {
			seeded = true;
			saveDefaultBackend.fields.set({
				url: current.defaultUrl,
				publishableKey: current.defaultKey,
			});
		}
	});

	let testResult = $state<boolean | null>(null);
	let testing = $state(false);

	async function test() {
		testing = true;
		testResult = null;
		try {
			const { ok } = await testDefaultBackend({
				url: String(saveDefaultBackend.fields.url.value() ?? ""),
				publishableKey: String(
					saveDefaultBackend.fields.publishableKey.value() ?? "",
				),
			});
			testResult = ok;
		} catch {
			testResult = false;
		} finally {
			testing = false;
		}
	}

	let confirming = $state<{ id: string; url: string; ban: boolean } | null>(
		null,
	);
	let banError = $state(false);

	async function confirmBan() {
		if (!confirming) {
			return;
		}
		banError = false;
		try {
			await setBackendBan({ id: confirming.id, banned: confirming.ban });
			confirming = null;
			await invalidateAll();
		} catch {
			banError = true;
		}
	}
</script>

{#snippet copyable(label: string, value: string)}
	<div class="flex flex-col gap-1">
		<span class="text-xs text-muted-foreground">{label}</span>
		<div class="flex items-center gap-2 rounded-lg border border-foreground/10 p-2">
			<code class="min-w-0 flex-1 font-mono text-xs break-all">{value}</code>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={m.admin_builtin_copy({ label })}
				onclick={() => copy(value)}
			>
				<CopyIcon class="size-4" />
			</Button>
		</div>
	</div>
{/snippet}

{#if tab.current}
	{@const data = tab.current}
	<div class="grid w-full gap-6 xl:grid-cols-2">
		{#if own.current}
			{@const summary = own.current}
			<!-- The browser's origin: a page load has no `Origin` header to tell the server its scheme. -->
			{@const builtInUrl = page.url.origin + new URL(summary.url).pathname}
			<Card.Root class="border border-foreground/10 xl:col-span-2">
				<Card.Header>
					<Card.Title>{m.admin_builtin_title()}</Card.Title>
					<Card.Description>{m.admin_builtin_description()}</Card.Description>
				</Card.Header>
				<Card.Content class="grid w-full gap-6 lg:grid-cols-2">
					<div class="flex flex-col gap-4">
						{@render copyable(m.auth_backend_url(), builtInUrl)}
						{@render copyable(m.auth_backend_key(), summary.publishableKey)}
						<p class="text-sm">
							{m.admin_backends_accounts()}:
							<span class="tabular-nums">{summary.accounts}</span>
						</p>
					</div>
					<div class="flex flex-col gap-4">
						{#if summary.hasAccount}
							<p class="text-sm text-muted-foreground">{m.admin_builtin_has_account()}</p>
						{:else}
							<form {...createBuiltInAccount} class="flex flex-col gap-3">
								<p class="text-sm text-muted-foreground">
									{m.admin_builtin_create_description()}
								</p>
								<Field.Field data-invalid={passwordIssue ? true : undefined}>
									<Field.FieldLabel for="builtin-password">{m.auth_password()}</Field.FieldLabel>
									<Input
										id="builtin-password"
										{...createBuiltInAccount.fields._password.as("password")}
										autocomplete="new-password"
									/>
									{#if passwordIssue}
										<Field.FieldError>{passwordIssue}</Field.FieldError>
									{/if}
								</Field.Field>
								<Button type="submit" variant="outline" class="w-fit">
									{m.admin_builtin_create()}
								</Button>
							</form>
						{/if}
						{#if summary.isDefault}
							<Badge variant="secondary" class="w-fit">{m.admin_builtin_in_use()}</Badge>
						{:else}
							<form {...useBuiltInBackend} class="flex flex-col gap-2">
								<p class="text-sm text-muted-foreground">{m.admin_builtin_use_note()}</p>
								<Button type="submit" class="w-fit" disabled={!summary.hasAccount}>
									{m.admin_builtin_use()}
								</Button>
								{#if switchIssue}
									<p class="text-sm text-destructive" role="alert">{switchIssue}</p>
								{/if}
							</form>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		{/if}
		<Card.Root class="border border-foreground/10">
			<Card.Header>
				<Card.Title>{m.admin_backends_allow()}</Card.Title>
				<Card.Description>{m.admin_backends_allow_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<div
					class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-foreground/10 p-4"
				>
					<span class="flex items-center gap-2 text-sm font-medium">
						<ServerIcon class="size-4" />
						{data.customAllowed
							? m.admin_backends_allowed()
							: m.admin_backends_disallowed()}
					</span>
					<form {...setCustomBackends}>
						<input
							{...setCustomBackends.fields.allowed.as(
								"hidden",
								data.customAllowed ? "off" : "on",
							)}
						/>
						<Button
							type="submit"
							variant={data.customAllowed ? "outline" : "default"}
						>
							{data.customAllowed
								? m.admin_backends_disallow()
								: m.admin_backends_allow()}
						</Button>
					</form>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border border-foreground/10">
			<Card.Header>
				<Card.Title>{m.admin_backends_default()}</Card.Title>
				<Card.Description>{m.admin_backends_default_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<form {...saveDefaultBackend}>
					<Field.FieldGroup>
						<Field.Field data-invalid={urlIssue ? true : undefined}>
							<Field.FieldLabel for="default-backend-url">
								{m.auth_backend_url()}
							</Field.FieldLabel>
							<Input
								id="default-backend-url"
								{...saveDefaultBackend.fields.url.as("text")}
								inputmode="url"
								autocomplete="off"
								spellcheck="false"
								placeholder="https://api.nuvio.tv"
							/>
							{#if urlIssue}
								<Field.FieldError>{urlIssue}</Field.FieldError>
							{/if}
						</Field.Field>
						<Field.Field data-invalid={keyIssue ? true : undefined}>
							<Field.FieldLabel for="default-backend-key">
								{m.auth_backend_key()}
							</Field.FieldLabel>
							<Input
								id="default-backend-key"
								{...saveDefaultBackend.fields.publishableKey.as("text")}
								autocomplete="off"
								spellcheck="false"
							/>
							{#if keyIssue}
								<Field.FieldError>{keyIssue}</Field.FieldError>
							{:else}
								<Field.FieldDescription>{m.auth_backend_key_hint()}</Field.FieldDescription>
							{/if}
						</Field.Field>
						<div class="flex flex-wrap items-center gap-2">
							<Button type="submit">{m.common_save()}</Button>
							<Button
								type="button"
								variant="outline"
								disabled={testing}
								onclick={test}
							>
								{m.admin_backends_test()}
							</Button>
							{#if testResult !== null}
								<span
									class="text-sm {testResult
										? 'text-muted-foreground'
										: 'text-destructive'}"
									role="status"
								>
									{testResult
										? m.admin_backends_test_ok()
										: m.admin_backends_test_failed()}
								</span>
							{/if}
						</div>
					</Field.FieldGroup>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border border-foreground/10 xl:col-span-2">
			<Card.Header>
				<Card.Title>{m.admin_backends_seen()}</Card.Title>
				<Card.Description>{m.admin_backends_seen_description()}</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if data.seen.length === 0}
					<p class="text-sm text-muted-foreground">{m.admin_backends_empty()}</p>
				{:else}
					<div class="w-full overflow-x-auto">
						<table class="w-full text-sm">
							<thead class="text-left text-xs text-muted-foreground">
								<tr>
									<th class="py-2 pr-4 font-medium">{m.auth_backend_url()}</th>
									<th class="py-2 pr-4 font-medium">{m.admin_backends_accounts()}</th>
									<th class="py-2 pr-4 font-medium">{m.admin_first_seen()}</th>
									<th class="py-2 pr-4 font-medium">{m.admin_last_seen()}</th>
									<th class="py-2 pr-4 font-medium">{m.admin_backends_status()}</th>
									<th class="py-2"><span class="sr-only">{m.admin_backends_ban()}</span></th>
								</tr>
							</thead>
							<tbody class="divide-y divide-foreground/10">
								{#each data.seen as backend (backend.id)}
									<tr>
										<td class="py-2 pr-4 font-mono text-xs break-all">{backend.url}</td>
										<td class="py-2 pr-4 tabular-nums">{backend.accountCount}</td>
										<td class="py-2 pr-4">{dateTime.format(backend.firstSeenAt)}</td>
										<td class="py-2 pr-4">{dateTime.format(backend.lastSeenAt)}</td>
										<td class="py-2 pr-4">
											<Badge variant={backend.banned ? "destructive" : "secondary"}>
												{backend.banned
													? m.admin_backends_banned()
													: m.admin_backends_usable()}
											</Badge>
										</td>
										<td class="py-2 text-right">
											<Button
												variant={backend.banned ? "outline" : "destructive"}
												size="sm"
												onclick={() =>
													(confirming = {
														id: backend.id,
														url: backend.url,
														ban: !backend.banned,
													})}
											>
												{backend.banned
													? m.admin_backends_unban()
													: m.admin_backends_ban()}
											</Button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
{/if}

<Dialog.Root
	open={confirming !== null}
	onOpenChange={(open) => {
		if (!open) {
			confirming = null;
			banError = false;
		}
	}}
>
	<Dialog.Content>
		{#if confirming}
			<Dialog.Header>
				<Dialog.Title>
					{confirming.ban
						? m.admin_backends_ban_confirm({ url: confirming.url })
						: m.admin_backends_unban_confirm({ url: confirming.url })}
				</Dialog.Title>
				<Dialog.Description>
					{confirming.ban
						? m.admin_backends_ban_confirm_description()
						: m.admin_backends_unban_confirm_description()}
				</Dialog.Description>
			</Dialog.Header>
			{#if banError}
				<p class="text-sm text-destructive" role="alert">{m.admin_backends_failed()}</p>
			{/if}
			<Dialog.Footer>
				<Button variant="outline" onclick={() => (confirming = null)}>
					{m.common_cancel()}
				</Button>
				<Button variant={confirming.ban ? "destructive" : "default"} onclick={confirmBan}>
					{confirming.ban ? m.admin_backends_ban() : m.admin_backends_unban()}
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
