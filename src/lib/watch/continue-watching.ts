/**
 * Pieces of the home page's continue-watching row shared by the load
 * (`watch-data.ts`) and the page, which rebuilds the row from the sync store.
 */

/** How many cards the row shows. The load names this many titles: a card past
 *  its cut has nothing to show for a name but its content id. */
export const CONTINUE_WATCHING_LIMIT = 20;

/**
 * The first real name among `candidates`, else the content id. "Still the
 * content id" is what an unresolved name looks like (the load and locally
 * logged history both fall back to it), so it never shadows a real one.
 */
export function resumeName(
	id: string,
	...candidates: Array<string | null | undefined>
): string {
	return candidates.find((name) => name && name !== id) ?? id;
}
