<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { NUVIO_WEBSITE_URL } from "#lib/nuvio/index.js";
	import { signOut } from "../../../auth/auth.remote.ts";

	let {
		data,
	}: { data: { user: { email?: string; created_at?: string } | null } } =
		$props();

	const memberSince = $derived(
		data.user?.created_at
			? new Date(data.user.created_at).toLocaleDateString(undefined, {
					day: "numeric",
					month: "long",
					year: "numeric",
				})
			: null,
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Sign-in</Card.Title>
		<Card.Description>The email and password for your Nuvio account.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Email</p>
				<p class="mt-1 truncate">{data.user?.email ?? "Unknown"}</p>
			</div>
			{#if memberSince}
				<div>
					<p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Member since</p>
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
				<ExternalLinkIcon data-icon="inline-start" /> Change password
			</Button>
			<form {...signOut.for("account-overview")}>
				<Button type="submit" variant="outline">Sign out</Button>
			</form>
		</div>
	</Card.Content>
</Card.Root>
