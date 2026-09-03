/**
 * Pinned here by `components.json` (`aliases.utils`) : the shadcn-svelte CLI
 * writes `import { cn } from "#lib/utils.js"` into every primitive it
 * generates. Keep this file to `cn` and the shadcn prop-type helpers; app
 * helpers with no shadcn tie belong in `#lib/core/`.
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

export type WithoutChild<T> = T extends { child?: unknown }
	? Omit<T, "child">
	: T;
export type WithoutChildren<T> = T extends { children?: unknown }
	? Omit<T, "children">
	: T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
