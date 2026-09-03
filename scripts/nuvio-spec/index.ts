export type { SpecDocument, SpecEndpoint } from "./endpoints.ts";
export { parseSpec } from "./endpoints.ts";
export type { OpenApiDocument } from "./openapi.ts";
export { buildOpenApi } from "./openapi.ts";

import { parseSpec } from "./endpoints.ts";
import type { OpenApiDocument } from "./openapi.ts";
import { buildOpenApi } from "./openapi.ts";

/** Markdown spec -> OpenAPI 3.1 document, with anything unmodelled reported. */
export function specToOpenApi(markdown: string): {
	document: OpenApiDocument;
	warnings: string[];
} {
	return buildOpenApi(parseSpec(markdown));
}

/** The serialized form that lands in `nuvio-public-api.json`. Tabs, like the
 * rest of the repo's JSON, so Biome leaves it alone. */
export function renderOpenApi(markdown: string): {
	json: string;
	operations: number;
	warnings: string[];
} {
	const { document, warnings } = specToOpenApi(markdown);
	return {
		json: `${JSON.stringify(document, null, "\t")}\n`,
		operations: Object.values(document.paths).reduce(
			(total, item) => total + Object.keys(item).length,
			0,
		),
		warnings,
	};
}
