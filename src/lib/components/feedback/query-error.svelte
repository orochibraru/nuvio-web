<script lang="ts">
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/i18n/index.js";

	let {
		message = m.shell_couldnt_load(),
		onRetry,
		class: className = "",
	}: {
		message?: string;
		onRetry: () => void | Promise<void>;
		class?: string;
	} = $props();

	let retrying = $state(false);

	async function retry() {
		retrying = true;
		try {
			await onRetry();
		} finally {
			retrying = false;
		}
	}
</script>

<div
	class="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-6 py-10 text-center {className}"
>
	<p class="text-sm text-muted-foreground">{message}</p>
	<Button variant="outline" size="sm" disabled={retrying} onclick={retry}>
		<RefreshCwIcon
			data-icon="inline-start"
			class={retrying ? "animate-spin" : ""}
		/>
		{m.common_try_again()}
	</Button>
</div>
