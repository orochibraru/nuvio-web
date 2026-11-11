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
	import { requestPasswordReset } from "../auth.remote.ts";

	pageTitle.set(m.auth_forgot_title());

	const formIssue = $derived(
		requestPasswordReset.fields.issues()?.[0]?.message,
	);
	const emailIssue = $derived(
		requestPasswordReset.fields.email.issues()?.[0]?.message,
	);
</script>

<Card.Root
	class="md:gap-8 md:bg-transparent md:py-0 md:shadow-none md:ring-0 md:inset-shadow-none md:backdrop-blur-none md:*:px-0"
>
	<Card.Header>
		<Card.Title class="md:text-3xl md:font-semibold md:tracking-tight">{m.auth_forgot_title()}</Card.Title>
		<Card.Description>{m.auth_forgot_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if requestPasswordReset.result?.sent}
			<Alert.Root>
				<Alert.Description>{m.auth_forgot_sent()}</Alert.Description>
			</Alert.Root>
		{:else}
			<form {...requestPasswordReset}>
				<Field.FieldGroup>
					{#if formIssue}
						<Alert.Root variant="destructive">
							<AlertCircleIcon />
							<Alert.Description>{formIssue}</Alert.Description>
						</Alert.Root>
					{/if}
					<Field.Field data-invalid={emailIssue ? true : undefined}>
						<Field.FieldLabel for="email">{m.common_email()}</Field.FieldLabel>
						<Input
							id="email"
							{...requestPasswordReset.fields.email.as("email")}
							autocomplete="email"
							placeholder="you@example.com"
						/>
						{#if emailIssue}
							<Field.FieldError>{emailIssue}</Field.FieldError>
						{/if}
					</Field.Field>
					<Field.Field>
						<Button
							type="submit"
							class="h-11 rounded-full"
							disabled={requestPasswordReset.pending > 0}
						>
							{#if requestPasswordReset.pending > 0}
								<Spinner data-icon="inline-start" />
							{/if}
							{m.auth_forgot_submit()}
						</Button>
					</Field.Field>
				</Field.FieldGroup>
			</form>
		{/if}
	</Card.Content>
	<Card.Footer class="justify-center md:justify-start">
		<a class="text-sm text-muted-foreground underline underline-offset-4" href={resolve("auth/sign-in")}
			>{m.auth_back_to_sign_in()}</a
		>
	</Card.Footer>
</Card.Root>
