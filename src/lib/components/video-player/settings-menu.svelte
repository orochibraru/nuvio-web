<script lang="ts">
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";

	const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];

	let {
		rate,
		audioTracks,
		activeAudioTrack,
		onRateSelect,
		onAudioTrackSelect,
	}: {
		rate: number;
		audioTracks: Array<{ id: number; label: string }>;
		activeAudioTrack: number;
		onRateSelect: (rate: number) => void;
		onAudioTrackSelect: (id: number) => void;
	} = $props();
</script>

<DropdownMenu.Content
	align="end"
	sideOffset={8}
	class="max-h-[70vh] w-44 overflow-y-auto scrollbar-thin"
>
	<DropdownMenu.Group>
		<DropdownMenu.GroupHeading class="text-xs font-medium text-muted-foreground">
			Playback speed
		</DropdownMenu.GroupHeading>
		<DropdownMenu.RadioGroup
			value={String(rate)}
			onValueChange={(value) => onRateSelect(Number(value))}
		>
			{#each rates as option (option)}
				<DropdownMenu.RadioItem value={String(option)}>
					{option === 1 ? "Normal" : `${option}×`}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Group>

	{#if audioTracks.length > 1}
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.GroupHeading class="text-xs font-medium text-muted-foreground">
				Audio
			</DropdownMenu.GroupHeading>
			<DropdownMenu.RadioGroup
				value={String(activeAudioTrack)}
				onValueChange={(value) => onAudioTrackSelect(Number(value))}
			>
				{#each audioTracks as track (track.id)}
					<DropdownMenu.RadioItem value={String(track.id)}>
						<span class="truncate">{track.label}</span>
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Group>
	{/if}
</DropdownMenu.Content>
