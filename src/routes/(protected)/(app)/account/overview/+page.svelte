<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { NUVIO_WEBSITE_URL } from "#lib/nuvio/index.js";
	import { signOut } from "../../../../auth/auth.remote.ts";
	import { deleteAccount } from "./account.remote.ts";

	let { data } = $props();

	pageTitle.set(m.account_tab_overview());

	let deleting = $state(false);
	const deleteIssue = $derived(deleteAccount.fields.issues()?.[0]?.message);
	const passwordIssue = $derived(
		deleteAccount.fields._password.issues()?.[0]?.message,
	);

	const memberSince = $derived(
		data.user?.created_at
			? new Date(data.user.created_at).toLocaleDateString(getLocale(), {
					day: "numeric",
					month: "long",
					year: "numeric",
				})
			: null,
	);
</script>

<Card.Root class="border border-foreground/10">
	<Card.Header>
		<Card.Title>{m.account_signin_title()}</Card.Title>
		<Card.Description>{m.account_signin_description()}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.common_email()}</p>
				<p class="mt-1 truncate">{data.user?.email ?? m.account_unknown()}</p>
			</div>
			{#if memberSince}
				<div>
					<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{m.account_member_since()}</p>
					<p class="mt-1">{memberSince}</p>
				</div>
			{/if}
		</div>
		<div class="flex flex-wrap gap-2">
			{#if !data.builtInAccount}
				<Button
					variant="outline"
					href={`${NUVIO_WEBSITE_URL}/account`}
					target="_blank"
					rel="noopener noreferrer"
				>
					<ExternalLinkIcon data-icon="inline-start" /> {m.account_change_password()}
				</Button>
			{/if}
			<form {...signOut.for("account-overview")}>
				<Button type="submit" variant="outline">{m.common_sign_out()}</Button>
			</form>
		</div>
	</Card.Content>
</Card.Root>

{#if data.builtInAccount}
	<Card.Root class="mt-6 border border-destructive/30">
		<Card.Header>
			<Card.Title>{m.account_delete_title()}</Card.Title>
			<Card.Description>{m.account_delete_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button variant="destructive" onclick={() => (deleting = true)}>
				{m.account_delete_submit()}
			</Button>
		</Card.Content>
	</Card.Root>

	<Dialog.Root bind:open={deleting}>
		<Dialog.Content>
			<form {...deleteAccount} class="flex flex-col gap-4">
				<Dialog.Header>
					<Dialog.Title>{m.account_delete_confirm()}</Dialog.Title>
					<Dialog.Description>{m.account_delete_confirm_description()}</Dialog.Description>
				</Dialog.Header>
				<Field.Field data-invalid={passwordIssue ? true : undefined}>
					<Field.FieldLabel for="delete-password">{m.auth_password()}</Field.FieldLabel>
					<Input
						id="delete-password"
						{...deleteAccount.fields._password.as("password")}
						autocomplete="current-password"
					/>
					{#if passwordIssue}
						<Field.FieldError>{passwordIssue}</Field.FieldError>
					{/if}
				</Field.Field>
				{#if deleteIssue}
					<p class="text-sm text-destructive" role="alert">{deleteIssue}</p>
				{/if}
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (deleting = false)}>
						{m.common_cancel()}
					</Button>
					<Button type="submit" variant="destructive" disabled={deleteAccount.pending > 0}>
						{#if deleteAccount.pending > 0}
							<Spinner data-icon="inline-start" />
						{/if}
						{m.account_delete_submit()}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
