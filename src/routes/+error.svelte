<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.js";
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	const status = $derived(page.status);
	const defaultErrorMessage = "Something went wrong.";

	// Cloudflare's own block page text reaches us verbatim through the API
	// client; it names the wrong audience (it is written for the site owner) and
	// runs to several paragraphs. Rewritten in the derived rather than an
	// `$effect`, because effects don't run during SSR: the raw text would render
	// on the server and only be swapped out after hydration.
	function readable(raw: string): string {
		if (raw.includes("api.nuvio.tv used Cloudflare to restrict access")) {
			return "The Nuvio Servers have restricted access to this client via Cloudflare. Please wait a few minutes before retrying.";
		}
		return raw;
	}

	// `hooks.server.ts`'s handleError already decides what is safe to say: a
	// deliberate `error(...)` keeps its own message, and only an unknown error
	// is replaced outside dev. Second-guessing it here only hid the message in
	// the one environment that wants it.
	const message = $derived(
		readable(page.error?.message ?? defaultErrorMessage),
	);
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
        Error {status}
    </p>
    <h1 class="relative text-xl font-semibold tracking-tight">{message}</h1>
    {#if errorId}
        <p class="text-muted-foreground relative font-mono text-xs">
            Error ID: {errorId}
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
            Go back
        </Button>
        <Button href={resolve("/(protected)/(app)")}>Home</Button>
    </div>
</div>
