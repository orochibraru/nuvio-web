<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { NUVIO_WEBSITE_URL } from "#lib/nuvio/index.js";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { signIn } from "../auth.remote.ts";

	pageTitle.set(m.auth_sign_in());

	let showPassword = $state(false);

	const redirectTo = $derived(page.url.searchParams.get("redirectTo") ?? "/");
	const justRegistered = $derived(
		page.url.searchParams.get("registered") === "1",
	);
	const formIssue = $derived(signIn.fields.issues()?.[0]?.message);
	const emailIssue = $derived(signIn.fields.email.issues()?.[0]?.message);
	const passwordIssue = $derived(signIn.fields.password.issues()?.[0]?.message);
	const signUpHref = $derived(
		redirectTo === "/"
			? resolve("auth/sign-up")
			: `${resolve("auth/sign-up")}?redirectTo=${encodeURIComponent(redirectTo)}`,
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{m.auth_sign_in()}</Card.Title>
		<Card.Description
			>{m.auth_sign_in_description()}</Card.Description
		>
	</Card.Header>
	<Card.Content>
		<form {...signIn}>
			<Field.FieldGroup>
				{#if justRegistered}
					<Alert.Root>
						<Alert.Description
							>{m.auth_registered()}</Alert.Description
						>
					</Alert.Root>
				{/if}
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
						{...signIn.fields.email.as('email')}
						autocomplete="email"
						placeholder="you@example.com"
					/>
					{#if emailIssue}
						<Field.FieldError>{emailIssue}</Field.FieldError>
					{/if}
				</Field.Field>

				<Field.Field data-invalid={passwordIssue ? true : undefined}>
					<div class="flex items-center justify-between">
						<Field.FieldLabel for="password">{m.auth_password()}</Field.FieldLabel>
						<a
							href={NUVIO_WEBSITE_URL}
							target="_blank"
							rel="noopener noreferrer"
							class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
						>
							{m.auth_forgot_password()}
						</a>
					</div>
					<div class="relative">
						<Input
							id="password"
							{...signIn.fields.password.as(showPassword ? 'text' : 'password')}
							autocomplete="current-password"
							class="pr-10"
						/>
						<button
							type="button"
							aria-label={showPassword ? m.auth_hide_password() : m.auth_show_password()}
							onclick={() => (showPassword = !showPassword)}
							class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
						>
							{#if showPassword}<EyeOffIcon class="size-4" />{:else}<EyeIcon class="size-4" />{/if}
						</button>
					</div>
					{#if passwordIssue}
						<Field.FieldError>{passwordIssue}</Field.FieldError>
					{/if}
				</Field.Field>

				<input {...signIn.fields.redirectTo.as('hidden', redirectTo)}>

				<Field.Field>
					<Button type="submit" disabled={signIn.pending > 0}>
						{#if signIn.pending > 0}
							<Spinner data-icon="inline-start" />
						{/if}
						{m.auth_sign_in()}
					</Button>
				</Field.Field>
			</Field.FieldGroup>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center">
		<p class="text-sm text-muted-foreground">
			{m.auth_new_to_nuvio()}
			<a class="underline underline-offset-4" href={signUpHref}
				>{m.auth_create_an_account()}</a
			>
		</p>
	</Card.Footer>
</Card.Root>
