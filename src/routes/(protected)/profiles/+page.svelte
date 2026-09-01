<script lang="ts">
	import LockIcon from "@lucide/svelte/icons/lock";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import { toast } from "svelte-sonner";
	import ProfileAvatar from "#lib/components/profile-avatar.svelte";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import * as Field from "#lib/components/ui/field/index.js";
	import { Input } from "#lib/components/ui/input/index.js";
	import { Spinner } from "#lib/components/ui/spinner/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import type { ProfileView } from "#lib/profile.js";
	import { pageTitle } from "#lib/stores/title.svelte.js";
	import { cn } from "#lib/utils.js";
	import { page } from "$app/state";
	import { signOut } from "../../auth/auth.remote.ts";
	import {
		createProfile,
		deleteProfile,
		selectProfile,
		updateProfile,
	} from "../profiles.remote.ts";

	pageTitle.set("Profiles");

	let { data } = $props();

	// Carried from the profile gate so a shared link resumes after picking.
	const redirectTo = $derived(page.url.searchParams.get("redirectTo") ?? "");

	const COLORS = [
		"#2563EB",
		"#DC2626",
		"#16A34A",
		"#D97706",
		"#7C3AED",
		"#DB2777",
		"#0891B2",
		"#4B5563",
	];

	let dialogOpen = $state(false);
	let selectedAvatarId = $state<string | undefined>(undefined);
	let selectedColor = $state("#2563EB");

	const canAdd = $derived((data.profiles?.length ?? 0) < 6);
	const nameIssue = $derived(createProfile.fields.name.issues()?.[0]?.message);

	// Manage mode: tiles open an editor instead of selecting the profile.
	let manage = $state(false);
	let editing = $state<ProfileView | null>(null);
	let deleteConfirmOpen = $state(false);
	let editName = $state("");
	let editColor = $state("#2563EB");
	let editAvatarId = $state<string | undefined>(undefined);
	let editUsesPrimaryAddons = $state(false);

	const editNameIssue = $derived(
		updateProfile.fields.name.issues()?.[0]?.message,
	);
	const deleteIssue = $derived(
		deleteProfile.fields.profileId.issues()?.[0]?.message,
	);

	function openEditor(profile: ProfileView) {
		editing = profile;
		editName = profile.name;
		editColor = profile.avatar_color_hex || "#2563EB";
		editAvatarId = profile.avatar_id ?? undefined;
		editUsesPrimaryAddons = profile.uses_primary_addons;
	}
</script>

<div class="relative flex min-h-svh flex-col items-center justify-center gap-12 p-8">
	<div
		class="pointer-events-none absolute inset-x-0 top-0 hidden h-[60vh] dark:block"
		style="background: radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 70%)"
	></div>

	<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
		{manage ? "Manage profiles" : "Who's watching?"}
	</h1>

	<div class="flex flex-wrap items-start justify-center gap-6">
		{#each data.profiles ?? [] as profile (profile.id)}
			{#if manage}
				<div class="flex w-28 flex-col items-center gap-3">
					<button
						type="button"
						aria-label={`Edit ${profile.name}`}
						onclick={() => openEditor(profile)}
						class="group relative flex flex-col items-center gap-3 rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<div
							class="size-24 overflow-hidden rounded-2xl ring-1 ring-white/10 transition-all duration-200 group-hover:scale-105 group-hover:opacity-60"
						>
							<ProfileAvatar {profile} />
						</div>
						<span
							class="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 ring-1 ring-border backdrop-blur transition-opacity group-hover:opacity-100"
						>
							<PencilIcon class="size-4" />
						</span>
					</button>
					<span class="max-w-full truncate text-sm font-medium text-muted-foreground">
						{profile.name}
					</span>
				</div>
			{:else if profile.pin_enabled}
				<button
					type="button"
					onclick={() =>
						toast.info(
							`${profile.name} is PIN-protected. Switch to it in the Nuvio app.`,
						)}
					class="group flex w-28 flex-col items-center gap-3 rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<div
						class="relative size-24 overflow-hidden rounded-2xl ring-1 ring-white/10 ring-offset-2 ring-offset-background transition-all duration-200 group-hover:scale-105"
					>
						<div class="opacity-40"><ProfileAvatar {profile} /></div>
						<span
							class="absolute inset-0 flex items-center justify-center bg-black/30 text-white"
						>
							<LockIcon class="size-6" />
						</span>
					</div>
					<span class="max-w-full truncate text-sm font-medium text-muted-foreground">
						{profile.name}
					</span>
				</button>
			{:else}
				{@const pick = selectProfile.for(profile.profile_index)}
				<form {...pick} class="contents">
					<input
						{...pick.fields.profileId.as("hidden", String(profile.profile_index))}
					/>
					<input {...pick.fields.redirectTo.as("hidden", redirectTo)} />
					<button
						type="submit"
						disabled={pick.pending > 0}
						class={cn(
							"group flex w-28 flex-col items-center gap-3 rounded-2xl p-2 outline-none",
							"focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
						)}
					>
						<div
							class="size-24 overflow-hidden rounded-2xl ring-1 ring-white/10 ring-offset-2 ring-offset-background transition-all duration-200 group-hover:scale-105 group-hover:ring-2 group-hover:ring-primary group-focus-visible:ring-2 group-focus-visible:ring-ring"
						>
							<ProfileAvatar {profile} />
						</div>
						<span class="max-w-full truncate text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
							{profile.name}
						</span>
					</button>
				</form>
			{/if}
		{/each}

		{#if canAdd && !manage}
			<button
				type="button"
				onclick={() => (dialogOpen = true)}
				class="group flex w-28 flex-col items-center gap-3 rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<div
					class="flex size-24 items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground transition-all duration-200 group-hover:scale-105 group-hover:border-foreground group-hover:text-foreground"
				>
					<PlusIcon class="size-8" />
				</div>
				<span class="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">Add profile</span>
			</button>
		{/if}
	</div>

	<div class="flex items-center gap-2">
		<Button variant="ghost" onclick={() => (manage = !manage)}>
			{manage ? "Done" : "Manage profiles"}
		</Button>
		<form {...signOut}>
			<Button type="submit" variant="ghost" class="text-muted-foreground">
				Sign out
			</Button>
		</form>
	</div>
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New profile</Dialog.Title>
			<Dialog.Description>Up to 6 profiles per account.</Dialog.Description>
		</Dialog.Header>

		<form {...createProfile}>
			<input {...createProfile.fields.redirectTo.as("hidden", redirectTo)} />
			<Field.FieldGroup>
				<Field.Field data-invalid={nameIssue ? true : undefined}>
					<Field.FieldLabel for="profile-name">Name</Field.FieldLabel>
					<Input id="profile-name" {...createProfile.fields.name.as("text")} placeholder="e.g. Living room" />
					{#if nameIssue}<Field.FieldError>{nameIssue}</Field.FieldError>{/if}
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel>Avatar</Field.FieldLabel>
					<div class="flex flex-wrap gap-2">
						{#each data.avatarCatalog ?? [] as avatar (avatar.id)}
							<button
								type="button"
								title={avatar.name}
								onclick={() => (selectedAvatarId = avatar.id)}
								class={cn(
									"size-12 overflow-hidden rounded-md ring-offset-2 ring-offset-background",
									selectedAvatarId === avatar.id && "ring-2 ring-ring",
								)}
								style={`background-color: ${avatar.bgColor ?? "var(--muted)"}`}
							>
								<img src={avatar.url} alt={avatar.name} loading="lazy" class="size-full object-cover" />
							</button>
						{/each}
					</div>
					<input {...createProfile.fields.avatarId.as("hidden", selectedAvatarId ?? "")} />
				</Field.Field>

				<Field.Field>
					<Field.FieldLabel>Colour</Field.FieldLabel>
					<div class="flex flex-wrap gap-2">
						{#each COLORS as color (color)}
							<button
								type="button"
								aria-label={`Colour ${color}`}
								aria-pressed={selectedColor === color}
								onclick={() => (selectedColor = color)}
								class={cn(
									"size-8 rounded-full ring-offset-2 ring-offset-background",
									selectedColor === color && "ring-2 ring-ring",
								)}
								style={`background-color: ${color}`}
							></button>
						{/each}
					</div>
					<input {...createProfile.fields.colorHex.as("hidden", selectedColor)} />
				</Field.Field>
			</Field.FieldGroup>

			<Dialog.Footer class="mt-6">
				<Button type="button" variant="ghost" onclick={() => (dialogOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={createProfile.pending > 0}>
					{#if createProfile.pending > 0}<Spinner data-icon="inline-start" />{/if}
					Create
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root
	open={editing !== null}
	onOpenChange={(open) => {
		if (!open) {
			editing = null;
		}
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Edit profile</Dialog.Title>
			<Dialog.Description>Changes apply to this profile only.</Dialog.Description>
		</Dialog.Header>

		{#if editing}
			<form {...updateProfile}>
				<input
					{...updateProfile.fields.profileId.as(
						"hidden",
						String(editing.profile_index),
					)}
				/>
				<Field.FieldGroup>
					<Field.Field data-invalid={editNameIssue ? true : undefined}>
						<Field.FieldLabel for="edit-name">Name</Field.FieldLabel>
						<Input
							id="edit-name"
							{...updateProfile.fields.name.as("text", editName)}
						/>
						{#if editNameIssue}
							<Field.FieldError>{editNameIssue}</Field.FieldError>
						{/if}
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel>Avatar</Field.FieldLabel>
						<div class="flex flex-wrap gap-2">
							{#each data.avatarCatalog ?? [] as avatar (avatar.id)}
								<button
									type="button"
									title={avatar.name}
									onclick={() => (editAvatarId = avatar.id)}
									class={cn(
										"size-12 overflow-hidden rounded-md ring-offset-2 ring-offset-background",
										editAvatarId === avatar.id && "ring-2 ring-ring",
									)}
									style={`background-color: ${avatar.bgColor ?? "var(--muted)"}`}
								>
									<img src={avatar.url} alt={avatar.name} loading="lazy" class="size-full object-cover" />
								</button>
							{/each}
						</div>
						<input
							{...updateProfile.fields.avatarId.as("hidden", editAvatarId ?? "")}
						/>
					</Field.Field>

					<Field.Field>
						<Field.FieldLabel>Colour</Field.FieldLabel>
						<div class="flex flex-wrap gap-2">
							{#each COLORS as color (color)}
								<button
									type="button"
									aria-label={`Colour ${color}`}
									aria-pressed={editColor === color}
									onclick={() => (editColor = color)}
									class={cn(
										"size-8 rounded-full ring-offset-2 ring-offset-background",
										editColor === color && "ring-2 ring-ring",
									)}
									style={`background-color: ${color}`}
								></button>
							{/each}
						</div>
						<input
							{...updateProfile.fields.colorHex.as("hidden", editColor)}
						/>
					</Field.Field>

					{#if editing.profile_index !== 1}
						<Field.Field orientation="horizontal">
							<Field.FieldContent>
								<Field.FieldLabel for="edit-primary-addons">
									Use the primary profile's addons
								</Field.FieldLabel>
								<Field.FieldDescription>
									Off means this profile keeps its own addon list.
								</Field.FieldDescription>
							</Field.FieldContent>
							<Switch
								id="edit-primary-addons"
								checked={editUsesPrimaryAddons}
								onCheckedChange={(value) => (editUsesPrimaryAddons = value)}
							/>
						</Field.Field>
						<input
							{...updateProfile.fields.usesPrimaryAddons.as(
								"hidden",
								editUsesPrimaryAddons ? "1" : "",
							)}
						/>
					{/if}
				</Field.FieldGroup>

				<Dialog.Footer class="mt-6">
					<Button type="button" variant="ghost" onclick={() => (editing = null)}>
						Cancel
					</Button>
					<Button type="submit" disabled={updateProfile.pending > 0}>
						{#if updateProfile.pending > 0}
							<Spinner data-icon="inline-start" />
						{/if}
						Save
					</Button>
				</Dialog.Footer>
			</form>

			{#if editing.profile_index !== 1 && (data.profiles?.length ?? 0) > 1}
				<div class="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
					<div class="text-sm text-muted-foreground">
						<p class="font-medium text-foreground">Delete this profile</p>
						<p>Its library, history and progress are removed.</p>
						{#if deleteIssue}
							<p class="mt-1 text-destructive">{deleteIssue}</p>
						{/if}
					</div>
					<Button
						type="button"
						variant="outline"
						class="shrink-0 text-destructive hover:text-destructive"
						onclick={() => (deleteConfirmOpen = true)}
					>
						<Trash2Icon data-icon="inline-start" /> Delete
					</Button>
				</div>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={deleteConfirmOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete {editing?.name}?</Dialog.Title>
			<Dialog.Description>
				Its library, history and watch progress are removed for good. This cannot be
				undone.
			</Dialog.Description>
		</Dialog.Header>
		{#if editing}
			{@const remove = deleteProfile.for(`del-${editing.profile_index}`)}
			<form {...remove}>
				<input
					{...remove.fields.profileId.as("hidden", String(editing.profile_index))}
				/>
				<Dialog.Footer class="mt-4">
					<Button
						type="button"
						variant="ghost"
						onclick={() => (deleteConfirmOpen = false)}
					>
						Cancel
					</Button>
					<Button type="submit" variant="destructive" disabled={remove.pending > 0}>
						{#if remove.pending > 0}<Spinner data-icon="inline-start" />{/if}
						Delete profile
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
