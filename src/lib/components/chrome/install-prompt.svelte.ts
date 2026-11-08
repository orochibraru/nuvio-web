type InstallEvent = Event & { prompt: () => Promise<unknown> };

declare global {
	interface Window {
		/** Set by `app.html`, which can hear the offer before the app hydrates. */
		__nuvioInstallPrompt?: InstallEvent;
	}
}

/**
 * The browser's install offer, held back so the profile menu (desktop) or the
 * account page (phone) can make it. Chromium only; Safari installs from its
 * Share menu.
 */
class InstallPrompt {
	#event = $state<InstallEvent | null>(null);

	get available(): boolean {
		return this.#event !== null;
	}

	/** Starts holding the offer; returns the cleanup. */
	listen(): () => void {
		this.#event = window.__nuvioInstallPrompt ?? null;
		const hold = (event: Event) => {
			event.preventDefault();
			this.#event = event as InstallEvent;
		};
		const installed = () => {
			window.__nuvioInstallPrompt = undefined;
			this.#event = null;
		};
		window.addEventListener("beforeinstallprompt", hold);
		window.addEventListener("appinstalled", installed);
		return () => {
			window.removeEventListener("beforeinstallprompt", hold);
			window.removeEventListener("appinstalled", installed);
		};
	}

	show() {
		void this.#event?.prompt();
		window.__nuvioInstallPrompt = undefined;
		this.#event = null;
	}
}

export const installPrompt = new InstallPrompt();
