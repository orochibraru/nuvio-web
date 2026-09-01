/** Shared open-state for the command palette, so the header search pill (and
 *  anything else) can open it, not just the ⌘K shortcut. */
class CommandPaletteState {
	open = $state(false);

	toggle() {
		this.open = !this.open;
	}

	show() {
		this.open = true;
	}
}

export const commandPalette = new CommandPaletteState();
