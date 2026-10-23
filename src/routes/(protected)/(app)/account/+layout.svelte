<script lang="ts">
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import { ACCOUNT_SECTIONS } from "#lib/account/sections.js";
	import { m } from "#lib/i18n/index.js";
	import { resolve } from "$app/paths";
	import { page } from "$app/state";

	let { children } = $props();

	// Each section is its own page; bare `/account` is the profile page that
	// lists them. From `md` up the header's section row switches sections.
	const current = $derived(
		ACCOUNT_SECTIONS.find((entry) =>
			page.url.pathname.endsWith(`/account/${entry.value}`),
		),
	);
</script>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
  {#if current}
    <a
      href={resolve("account")}
      class="-ml-2 flex w-fit items-center gap-0.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-primary transition active:scale-95 md:hidden"
    >
      <ChevronLeftIcon class="size-5" />
      {m.nav_account()}
    </a>

    <h1 class="text-3xl font-bold tracking-tight">{current.label}</h1>
  {/if}

  <div class="min-w-0">
    {@render children()}
  </div>
</div>
