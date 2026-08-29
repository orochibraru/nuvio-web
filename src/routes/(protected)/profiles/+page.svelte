<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import ProfileAvatar from "$lib/components/profile-avatar.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Dialog from "$lib/components/ui/dialog/index.js";
	import * as Field from "$lib/components/ui/field/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import { cn } from "$lib/utils.js";
	import { createProfile, selectProfile } from "../profiles.remote";

	let { data } = $props();

	let dialogOpen = $state(false);
	let selectedAvatarId = $state<string | undefined>(undefined);
	let selectedColor = $state("#2563EB");

	const canAdd = $derived((data.profiles?.length ?? 0) < 6);
	const nameIssue = $derived(createProfile.fields.name.issues()?.[0]?.message);
</script>

<div class="relative flex min-h-svh flex-col items-center justify-center gap-12 p-8">
	<div
		class="pointer-events-none absolute inset-x-0 top-0 hidden h-[60vh] dark:block"
		style="background: radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 70%)"
	></div>

	<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Who's watching?</h1>

	<div class="flex flex-wrap items-start justify-center gap-6">
		{#each data.profiles ?? [] as profile (profile.id)}
			{@const pick = selectProfile.for(profile.profile_index)}
			<form {...pick} class="contents">
				<input
					{...pick.fields.profileId.as("hidden", String(profile.profile_index))}
				/>
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
		{/each}

		{#if canAdd}
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
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New profile</Dialog.Title>
			<Dialog.Description>Up to 6 profiles per account.</Dialog.Description>
		</Dialog.Header>

		<form {...createProfile}>
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
						{#each ["#2563EB", "#DC2626", "#16A34A", "#D97706", "#7C3AED", "#DB2777", "#0891B2", "#4B5563"] as color (color)}
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
