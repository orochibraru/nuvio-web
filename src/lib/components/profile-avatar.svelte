<script lang="ts">
	import * as Avatar from "$lib/components/ui/avatar/index.js";
	import { type ProfileView, profileInitial } from "$lib/profile.js";
	import { cn } from "$lib/utils.js";

	let { profile, class: className }: { profile: ProfileView; class?: string } =
		$props();
</script>

<Avatar.Root
	class={cn("size-full rounded-lg", className)}
	style={profile.avatarImageUrl ? undefined : `background-color: ${profile.avatar_color_hex}`}
>
	{#if profile.avatarImageUrl}
		<Avatar.Image src={profile.avatarImageUrl} alt={profile.name} class="object-cover" />
	{/if}
	<Avatar.Fallback
		class="rounded-lg text-lg font-semibold text-white"
		style={`background-color: ${profile.avatar_color_hex}`}
	>
		{profileInitial(profile.name)}
	</Avatar.Fallback>
</Avatar.Root>
