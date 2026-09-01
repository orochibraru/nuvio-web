import { browser } from "$app/env";

/** True when the viewer has asked the OS for reduced motion. */
export function prefersReducedMotion(): boolean {
	return (
		browser &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

/**
 * Collapse a Svelte transition param set to instant when the viewer prefers
 * reduced motion — `transition:fly={reduced({ y: 16, duration: 220 })}`.
 */
export function reduced<T extends { duration?: number }>(params: T): T {
	return prefersReducedMotion() ? { ...params, duration: 0 } : params;
}
