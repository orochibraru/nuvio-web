<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import EyeOffIcon from "@lucide/svelte/icons/eye-off";
	import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
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
	import { hostOf, targetOf } from "../backend-target.ts";
	import CustomBackend from "../custom-backend.svelte";

	let { data } = $props();

	pageTitle.set(m.auth_sign_in());

	let showPassword = $state(false);

	const redirectTo = $derived(page.url.searchParams.get("redirectTo") ?? "/");
	const justRegistered = $derived(
		page.url.searchParams.get("registered") === "1",
	);
	const target = $derived(
		targetOf(signIn.fields.backendUrl.value(), data.defaultTarget, {
			officialUrl: data.officialBackendUrl,
			customAllowed: data.customBackendsAllowed,
		}),
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

<Card.Root
	class="md:gap-8 md:bg-transparent md:py-0 md:shadow-none md:ring-0 md:inset-shadow-none md:backdrop-blur-none md:*:px-0"
>
	<Card.Header>
		<Card.Title class="md:text-3xl md:font-semibold md:tracking-tight">{m.auth_sign_in()}</Card.Title>
		<Card.Description
			>{m.auth_sign_in_description()}</Card.Description
		>
	</Card.Header>
	<Card.Content>
		<form {...signIn}>
			<Field.FieldGroup>
				<CustomBackend
					url={signIn.fields.backendUrl}
					publishableKey={signIn.fields.backendKey}
					allowed={data.customBackendsAllowed}
					defaultTarget={data.defaultTarget}
					officialUrl={data.officialBackendUrl}
				/>
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
						{#if target.kind === "nuvio"}
						<a
							href={`${NUVIO_WEBSITE_URL}/account/reset-password?next=%2Faccount`}
							target="_blank"
							rel="noopener noreferrer"
							class="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
						>
							{m.auth_forgot_password()}
						</a>
						{/if}
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
					<Button type="submit" class="h-11 rounded-full" disabled={signIn.pending > 0}>
						{#if signIn.pending > 0}
							<Spinner data-icon="inline-start" />
						{/if}
						{m.auth_sign_in()}
					</Button>
				</Field.Field>
			</Field.FieldGroup>
		</form>
	</Card.Content>
	<Card.Footer class="flex-col gap-3 text-center md:items-start md:text-left">
		<p class="flex items-start gap-2 text-left text-xs text-muted-foreground">
			<ShieldCheckIcon class="mt-px size-3.5 shrink-0" />
			{#if target.kind === "nuvio"}
				{m.auth_credentials_note()}
			{:else if target.kind === "server"}
				{m.auth_credentials_note_server()}
			{:else}
				{m.auth_credentials_note_backend({ host: hostOf(target) })}
			{/if}
		</p>
		<p class="text-sm text-muted-foreground">
			{m.auth_new_to_nuvio()}
			<a class="underline underline-offset-4" href={signUpHref}
				>{m.auth_create_an_account()}</a
			>
		</p>
	</Card.Footer>
</Card.Root>
