<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { getLocale, m } from "#lib/i18n/index.js";
	import { NUVIO_WEBSITE_URL } from "#lib/nuvio/index.js";
	import { signOut } from "../../../auth/auth.remote.ts";

	let {
		data,
	}: { data: { user: { email?: string; created_at?: string } | null } } =
		$props();

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
			<Button
				variant="outline"
				href={`${NUVIO_WEBSITE_URL}/account`}
				target="_blank"
				rel="noopener noreferrer"
			>
				<ExternalLinkIcon data-icon="inline-start" /> {m.account_change_password()}
			</Button>
			<form {...signOut.for("account-overview")}>
				<Button type="submit" variant="outline">{m.common_sign_out()}</Button>
			</form>
		</div>
	</Card.Content>
</Card.Root>
