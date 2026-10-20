<script lang="ts">
	import { Tooltip } from "bits-ui";
	import type { Snippet } from "svelte";

	let {
		label,
		side = "top",
		child,
	}: {
		/** What the control does, shortcut included (`m.player_*_hint()`). */
		label: string;
		side?: "top" | "right" | "bottom" | "left";
		/** The control itself : spread `props` on it (they carry the trigger's
		 *  handlers and ARIA wiring). */
		child: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	let open = $state(false);

	// A tooltip portalled to `<body>` is outside the top layer while the player's
	// own div is fullscreen, so it would never paint. Portal into whatever is
	// fullscreen instead; the document itself (the player filling the viewport)
	// still reaches `<body>`. Closed (and always on the server, where neither
	// `document` nor `HTMLElement` exists) it never touches the DOM.
	const target = $derived.by<HTMLElement | string>(() => {
		if (!open) {
			return "body";
		}
		const fullscreen = document.fullscreenElement;
		return fullscreen instanceof HTMLElement &&
			fullscreen !== document.documentElement
			? fullscreen
			: "body";
	});
</script>

<!-- A styled hover / focus tooltip for a player control with no visible text,
     replacing the native `title` (slow, unstyled, and unreliable in
     fullscreen). Its own provider, so it works wherever the player is mounted. -->
<Tooltip.Provider delayDuration={300}>
  <Tooltip.Root bind:open>
    <Tooltip.Trigger {child} />
    <Tooltip.Portal to={target}>
      <!-- Escape belongs to the dialog / menu underneath first: a dialog
           focusing its ✕ on open would otherwise hand the key to the ✕'s
           tooltip and stay open itself. -->
      <Tooltip.Content
        {side}
        sideOffset={8}
        escapeKeydownBehavior="defer-otherwise-close"
        class="dark pointer-events-none z-60 rounded-lg bg-black/80 px-2.5 py-1 text-xs font-medium text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md"
      >
        {label}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
