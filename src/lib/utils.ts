import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Returns `value` only when it is an `http:` / `https:` URL, else `null`. Guards
 * addon-supplied URLs bound to `href` / `src` / `window.open` against
 * `javascript:` and `data:` injection.
 */
export function httpUrlOrNull(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	try {
		const { protocol } = new URL(value);
		if (protocol === "http:" || protocol === "https:") {
			return value;
		}
	} catch {
		return null;
	}
	return null;
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
