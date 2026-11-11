<script lang="ts">
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import * as Alert from "#lib/components/ui/alert/index.js";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { pageTitle } from "#lib/core/title.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import { confirmEmail } from "../auth.remote.ts";

	pageTitle.set(m.auth_confirm_title());

	// A button, not on load: a mail scanner opening the link must not spend it.
	const token = $derived(page.url.searchParams.get("token") ?? "");
	const formIssue = $derived(confirmEmail.fields.issues()?.[0]?.message);
</script>

<Card.Root
	class="md:gap-8 md:bg-transparent md:py-0 md:shadow-none md:ring-0 md:inset-shadow-none md:backdrop-blur-none md:*:px-0"
>
	<Card.Header>
		<Card.Title class="md:text-3xl md:font-semibold md:tracking-tight">{m.auth_confirm_title()}</Card.Title>
		<Card.Description>{m.auth_confirm_description()}</Card.Description>
	</Card.Header>
	<Card.Content>
		<form {...confirmEmail}>
			<Field.FieldGroup>
				{#if formIssue || !token}
					<Alert.Root variant="destructive">
						<AlertCircleIcon />
						<Alert.Description>{formIssue ?? m.auth_error_link_invalid()}</Alert.Description>
					</Alert.Root>
				{/if}
				<input {...confirmEmail.fields.token.as("hidden", token)} />
				<Field.Field>
					<Button
						type="submit"
						class="h-11 rounded-full"
						disabled={!token || confirmEmail.pending > 0}
					>
						{#if confirmEmail.pending > 0}
							<Spinner data-icon="inline-start" />
						{/if}
						{m.auth_confirm_submit()}
					</Button>
				</Field.Field>
			</Field.FieldGroup>
		</form>
	</Card.Content>
	<Card.Footer class="justify-center md:justify-start">
		<a class="text-sm text-muted-foreground underline underline-offset-4" href={resolve("auth/sign-in")}
			>{m.auth_back_to_sign_in()}</a
		>
	</Card.Footer>
</Card.Root>
