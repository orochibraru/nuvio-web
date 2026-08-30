<script lang="ts">
	import MonitorIcon from "@lucide/svelte/icons/monitor";
	import SmartphoneIcon from "@lucide/svelte/icons/smartphone";
	import { NUVIO_WEBSITE_URL } from "$lib/nuvio/index.js";
</script>

<div
	class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-background px-6 text-center md:hidden"
>
	<span
		class="flex size-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground"
	>
		N
	</span>
	<div class="flex items-center gap-3 text-muted-foreground">
		<SmartphoneIcon class="size-6" />
		<span class="text-2xl">→</span>
		<MonitorIcon class="size-6" />
	</div>
	<div class="flex flex-col gap-2">
		<p class="text-lg font-semibold tracking-tight">Nuvio web is built for the desktop</p>
		<p class="mx-auto max-w-xs text-sm text-muted-foreground">
			Open this in a browser on a larger screen, or grab the Nuvio mobile app for
			phones and tablets.
		</p>
	</div>
	<a
		href={NUVIO_WEBSITE_URL}
		class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
	>
		Get the mobile app
	</a>
</div>
