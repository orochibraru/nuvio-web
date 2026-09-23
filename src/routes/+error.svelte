<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.js";
	import { m } from "#lib/i18n/index.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	const status = $derived(page.status);

	// Cloudflare's own block page text reaches us verbatim through the API
	// client; it names the wrong audience (it is written for the site owner) and
	// runs to several paragraphs. Rewritten in the derived rather than an
	// `$effect`, because effects don't run during SSR: the raw text would render
	// on the server and only be swapped out after hydration.
	function readable(raw: string): string {
		if (raw.includes("api.nuvio.tv used Cloudflare to restrict access")) {
			return m.error_cloudflare();
		}
		return raw;
	}

	// `hooks.server.ts`'s handleError already decides what is safe to say: a
	// deliberate `error(...)` keeps its own message, and only an unknown error
	// is replaced outside dev. Second-guessing it here only hid the message in
	// the one environment that wants it.
	const message = $derived(readable(page.error?.message ?? m.error_default()));
	const errorId = $derived(page.error?.errorId);
</script>

<div
    class="relative flex min-h-svh flex-col items-center justify-center gap-4 overflow-hidden p-6 text-center"
>
    <div
        class="pointer-events-none absolute inset-x-0 top-0 hidden h-[50vh] dark:block"
        style="background: radial-gradient(50% 45% at 50% 0%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 70%)"
    ></div>
    <p class="relative text-7xl font-bold tracking-tight text-foreground">
        {m.error_status({ status })}
    </p>
    <h1 class="relative text-xl font-semibold tracking-tight">{message}</h1>
    {#if errorId}
        <p class="text-muted-foreground relative font-mono text-xs">
            {m.error_id({ id: errorId })}
        </p>
    {/if}
    <div class="relative mt-2 flex gap-2">
        <Button
            variant="outline"
            onclick={() =>
                history.length > 1
                    ? history.back()
                    : goto(resolve("/(protected)/(app)"))}
        >
            {m.common_go_back()}
        </Button>
        <Button href={resolve("/(protected)/(app)")}>{m.nav_home()}</Button>
    </div>
</div>
