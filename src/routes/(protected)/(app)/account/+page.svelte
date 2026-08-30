<script lang="ts">
	import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
	import { toast } from "svelte-sonner";
	import { invalidateAll } from "$app/navigation";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { NUVIO_WEBSITE_URL } from "$lib/nuvio/index.js";
	import { pageTitle } from "$lib/stores/title.svelte.js";
	import { sync } from "$lib/sync/store.svelte.js";
	import { signOut } from "../../../auth/auth.remote";
	import { deleteProfileData } from "./account.remote";

	pageTitle.set("Account");

	let { data } = $props();

	const memberSince = $derived(
		data.user?.created_at
			? new Date(data.user.created_at).toLocaleDateString(undefined, {
					day: "numeric",
					month: "long",
					year: "numeric",
				})
			: null,
	);

	const stats = $derived(data.overview.profiles);

	const columns: Array<{ key: keyof (typeof stats)[number]; label: string }> = [
		{ key: "addons", label: "Addons" },
		{ key: "library", label: "Library" },
		{ key: "watchProgress", label: "In progress" },
		{ key: "watched", label: "Watched" },
	];

	let confirmOpen = $state(false);
	let deleting = $state(false);

	async function wipeCurrentProfile() {
		deleting = true;
		try {
			await deleteProfileData({ profileIndex: data.profile.profile_index });
			await sync.clear(data.profile.profile_index);
			await invalidateAll();
			toast.success(`Cleared all synced data for ${data.profile.name}.`);
			confirmOpen = false;
		} catch {
			toast.error("Couldn't clear this profile's data.");
		} finally {
			deleting = false;
		}
	}
</script>

<div class="flex max-w-3xl flex-col gap-6">
	<h1 class="text-3xl font-bold tracking-tight">Account</h1>

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
				<form {...signOut}>
					<Button type="submit" variant="outline">Sign out</Button>
				</form>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Storage &amp; sync</Card.Title>
			<Card.Description>What's synced to your account, per profile.</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
							<th class="py-2 pr-4 font-medium">Profile</th>
							{#each columns as column (column.key)}
								<th class="py-2 pr-4 text-right font-medium">{column.label}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each stats as row (row.index)}
							<tr class="border-b border-border/50 last:border-0">
								<td class="py-2.5 pr-4">
									<span class="flex items-center gap-2">
										<span
											class="size-2.5 shrink-0 rounded-full"
											style={`background-color: ${row.color}`}
										></span>
										<span class="truncate font-medium">{row.name}</span>
										{#if row.index === data.profile.profile_index}
											<span class="text-xs text-muted-foreground">(current)</span>
										{/if}
									</span>
								</td>
								{#each columns as column (column.key)}
									<td class="py-2.5 pr-4 text-right tabular-nums">{row[column.key]}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-destructive/30">
		<Card.Header>
			<Card.Title class="text-destructive">Danger zone</Card.Title>
			<Card.Description>
				Clear every synced library item, watch-progress entry and history row for the
				<span class="font-medium text-foreground">{data.profile.name}</span> profile. Other
				profiles and your account are untouched. This cannot be undone.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button variant="destructive" onclick={() => (confirmOpen = true)}>
				Clear {data.profile.name}'s data
			</Button>
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Clear {data.profile.name}'s data?</Dialog.Title>
			<Dialog.Description>
				This wipes the library, watch progress and history for this profile from every
				device. Installed addons and appearance settings stay.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="mt-4">
			<Button variant="ghost" onclick={() => (confirmOpen = false)}>Cancel</Button>
			<Button variant="destructive" disabled={deleting} onclick={wipeCurrentProfile}>
				{#if deleting}<Spinner data-icon="inline-start" />{/if}
				Clear data
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
