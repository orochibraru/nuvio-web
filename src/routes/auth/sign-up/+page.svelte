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
	import { signUp } from "../auth.remote.ts";

	pageTitle.set(m.auth_sign_up());

	const redirectTo = $derived(page.url.searchParams.get("redirectTo") ?? "/");
	const formIssue = $derived(signUp.fields.issues()?.[0]?.message);
	const emailIssue = $derived(signUp.fields.email.issues()?.[0]?.message);
	const passwordIssue = $derived(signUp.fields.password.issues()?.[0]?.message);
	const signInHref = $derived(
		redirectTo === "/"
			? resolve("auth/sign-in")
			: `${resolve("auth/sign-in")}?redirectTo=${encodeURIComponent(redirectTo)}`,
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.auth_create_an_account()}</Card.Title>
		<Card.Description>{m.auth_sign_up_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form {...signUp}>
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
						{...signUp.fields.email.as('email')}
						autocomplete="email"
						placeholder="you@example.com"
					/>
					{#if emailIssue}
						<Field.FieldError>{emailIssue}</Field.FieldError>
					{/if}
				</Field.Field>

				<Field.Field data-invalid={passwordIssue ? true : undefined}>
					<Field.FieldLabel for="password">{m.auth_password()}</Field.FieldLabel>
					<Input
						id="password"
						{...signUp.fields.password.as('password')}
						autocomplete="new-password"
					/>
					{#if passwordIssue}
						<Field.FieldError>{passwordIssue}</Field.FieldError>
					{:else}
						<Field.FieldDescription
							>{m.auth_password_hint()}</Field.FieldDescription
						>
					{/if}
				</Field.Field>

				<input {...signUp.fields.redirectTo.as('hidden', redirectTo)}>

				<Field.Field>
					<Button type="submit" disabled={signUp.pending > 0}>
						{#if signUp.pending > 0}
							<Spinner data-icon="inline-start" />
						{/if}
						{m.auth_create_account()}
					</Button>
				</Field.Field>
			</Field.FieldGroup>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center">
		<p class="text-sm text-muted-foreground">
			{m.auth_have_account()}
			<a class="underline underline-offset-4" href={signInHref}>{m.auth_sign_in()}</a>
		</p>
	</Card.Footer>
</Card.Root>
