<script lang="ts">
	import { toast } from "svelte-sonner";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { streamed } from "#lib/core/stream.svelte.js";
	import { m } from "#lib/i18n/index.js";
	import { sync } from "#lib/sync/store.svelte.js";
	import { refreshAll } from "$app/navigation";
	import { deleteProfileData } from "./account.remote.ts";
	import type { pullSyncOverview } from "./account-data.ts";

	let {
		data,
	}: {
		data: {
			overview: ReturnType<typeof pullSyncOverview>;
			profile: { profile_index: number; name: string };
		};
	} = $props();

	const overviewStream = streamed(() => data.overview, {
		profiles: [] as Awaited<typeof data.overview>["profiles"],
	});
	const stats = $derived(overviewStream.current.profiles);

	const columns: Array<{ key: keyof (typeof stats)[number]; label: string }> = [
		{ key: "addons", label: m.settings_section_addons() },
		{ key: "library", label: m.nav_library() },
		{ key: "watchProgress", label: m.account_in_progress() },
		{ key: "watched", label: m.account_watched() },
	];

	let confirmOpen = $state(false);
	let deleting = $state(false);

	async function wipeCurrentProfile() {
		deleting = true;
		try {
			await deleteProfileData({ profileIndex: data.profile.profile_index });
			await sync.clear();
			await refreshAll();
			toast.success(m.account_cleared({ name: data.profile.name }));
			confirmOpen = false;
		} catch {
			toast.error(m.account_clear_failed());
		} finally {
			deleting = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	<Card.Root class="border border-foreground/10">
		<Card.Header>
			<Card.Title>{m.account_tab_storage()}</Card.Title>
			<Card.Description>{m.account_storage_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
							<th class="py-2 pr-4 font-medium">{m.account_profile()}</th>
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
											<span class="text-xs text-muted-foreground">{m.account_current()}</span>
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
			<Card.Title class="text-destructive">{m.account_danger_zone()}</Card.Title>
			<Card.Description>
				{m.account_danger_before()}
				<span class="font-medium text-foreground">{data.profile.name}</span
				>{m.account_danger_after()}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button variant="destructive" onclick={() => (confirmOpen = true)}>
				{m.account_clear_named({ name: data.profile.name })}
			</Button>
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.account_clear_named_confirm({ name: data.profile.name })}</Dialog.Title>
			<Dialog.Description>
				{m.account_clear_confirm_description()}
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="mt-4">
			<Button variant="ghost" onclick={() => (confirmOpen = false)}>{m.common_cancel()}</Button>
			<Button variant="destructive" disabled={deleting} onclick={wipeCurrentProfile}>
				{#if deleting}<Spinner data-icon="inline-start" />{/if}
				{m.account_clear_data()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
