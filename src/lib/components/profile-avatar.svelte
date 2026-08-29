<script lang="ts">
	import { type ProfileView, profileInitial } from "$lib/profile.js";
	import { cn } from "$lib/utils.js";

	let { profile, class: className }: { profile: ProfileView; class?: string } =
		$props();

	let broken = $state(false);
	// Reset when the resolved image changes (e.g. the shell avatar after a profile switch).
	$effect(() => {
		void profile.avatarImageUrl;
		broken = false;
	});
</script>

<div
	class={cn(
		"flex size-full items-center justify-center overflow-hidden rounded-lg text-lg font-semibold text-white select-none",
		className,
	)}
	style="background-color: {profile.avatar_color_hex}"
>
	{#if profile.avatarImageUrl && !broken}
		<img
			src={profile.avatarImageUrl}
			alt={profile.name}
			draggable="false"
			class="size-full object-cover"
			onerror={() => (broken = true)}
		/>
	{:else}
		{profileInitial(profile.name)}
	{/if}
</div>
