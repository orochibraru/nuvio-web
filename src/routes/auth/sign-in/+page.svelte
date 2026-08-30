<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import { page } from "$app/state";
	import * as Alert from "$lib/components/ui/alert/index.js";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { signIn } from "../auth.remote";

	pageTitle.set("Sign in");

	const redirectTo = $derived(page.url.searchParams.get("redirectTo") ?? "/");
	const justRegistered = $derived(
		page.url.searchParams.get("registered") === "1",
	);
	const formIssue = $derived(signIn.fields.issues()?.[0]?.message);
	const emailIssue = $derived(signIn.fields.email.issues()?.[0]?.message);
	const passwordIssue = $derived(signIn.fields.password.issues()?.[0]?.message);
	const signUpHref = $derived(
		redirectTo === "/"
			? "/auth/sign-up"
			: `/auth/sign-up?redirectTo=${encodeURIComponent(redirectTo)}`,
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Sign in</Card.Title>
		<Card.Description
			>Enter your email and password to continue.</Card.Description
		>
	</Card.Header>
	<Card.Content>
		<form {...signIn}>
			<Field.FieldGroup>
				{#if justRegistered}
					<Alert.Root>
						<Alert.Description
							>Account created. Sign in to continue.</Alert.Description
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
					<Field.FieldLabel for="email">Email</Field.FieldLabel>
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
					<Field.FieldLabel for="password">Password</Field.FieldLabel>
					<Input
						id="password"
						{...signIn.fields.password.as('password')}
						autocomplete="current-password"
					/>
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
						Sign in
					</Button>
				</Field.Field>
			</Field.FieldGroup>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center">
		<p class="text-sm text-muted-foreground">
			New to Nuvio?
			<a class="underline underline-offset-4" href={signUpHref}
				>Create an account</a
			>
		</p>
	</Card.Footer>
</Card.Root>
