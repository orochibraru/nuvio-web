<script lang="ts">
	import { Button } from "#lib/components/ui/button/index.js";
	import { signOut } from "../auth/auth.remote";

	let { data } = $props();
</script>

<div class="mx-auto flex max-w-2xl flex-col gap-4 p-8">
	<h1 class="text-2xl font-semibold tracking-tight">Welcome to Nuvio</h1>
	<p class="text-muted-foreground">Signed in as {data.user.email}</p>
	<form {...signOut}>
		<Button type="submit" variant="outline">Sign out</Button>
	</form>
</div>
