<script lang="ts">
	import PuzzleIcon from "@lucide/svelte/icons/puzzle";
	import { Button } from "#lib/components/ui/button/index.js";
	import * as Card from "#lib/components/ui/card/index.js";
	import { resolve } from "$app/paths";
</script>

<Card.Root class="border border-foreground/10">
	<Card.Header>
		<Card.Title>Addons</Card.Title>
		<Card.Description>
			Catalogs, metadata, streams and subtitles come from your installed
			addons.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<Button href={resolve("addons")} variant="outline">
			<PuzzleIcon data-icon="inline-start" />
			Manage addons
		</Button>
	</Card.Content>
</Card.Root>
