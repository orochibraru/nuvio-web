<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { resetPassword } from "../auth.remote.ts";

	pageTitle.set(m.auth_reset_title());

	const token = $derived(page.url.searchParams.get("token") ?? "");
	const formIssue = $derived(resetPassword.fields.issues()?.[0]?.message);
	const passwordIssue = $derived(
		resetPassword.fields.password.issues()?.[0]?.message,
	);
</script>

<Card.Root
	class="md:gap-8 md:bg-transparent md:py-0 md:shadow-none md:ring-0 md:inset-shadow-none md:backdrop-blur-none md:*:px-0"
>
	<Card.Header>
		<Card.Title class="md:text-3xl md:font-semibold md:tracking-tight">{m.auth_reset_title()}</Card.Title>
		<Card.Description>{m.auth_reset_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form {...resetPassword}>
			<Field.FieldGroup>
				{#if formIssue || !token}
					<Alert.Root variant="destructive">
						<AlertCircleIcon />
						<Alert.Description>{formIssue ?? m.auth_error_link_invalid()}</Alert.Description>
					</Alert.Root>
				{/if}
				<input {...resetPassword.fields.token.as("hidden", token)} />
				<Field.Field data-invalid={passwordIssue ? true : undefined}>
					<Field.FieldLabel for="password">{m.auth_new_password()}</Field.FieldLabel>
					<Input
						id="password"
						{...resetPassword.fields.password.as("password")}
						autocomplete="new-password"
					/>
					{#if passwordIssue}
						<Field.FieldError>{passwordIssue}</Field.FieldError>
					{:else}
						<Field.FieldDescription>{m.auth_password_hint()}</Field.FieldDescription>
					{/if}
				</Field.Field>
				<Field.Field>
					<Button
						type="submit"
						class="h-11 rounded-full"
						disabled={!token || resetPassword.pending > 0}
					>
						{#if resetPassword.pending > 0}
							<Spinner data-icon="inline-start" />
						{/if}
						{m.auth_reset_submit()}
					</Button>
				</Field.Field>
			</Field.FieldGroup>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center md:justify-start">
		<a class="text-sm text-muted-foreground underline underline-offset-4" href={resolve("auth/forgot-password")}
			>{m.auth_forgot_password()}</a
		>
	</Card.Footer>
</Card.Root>
