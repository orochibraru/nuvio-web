/**
 * Assembles the parsed spec into an OpenAPI 3.1 document.
 */
import { applyTables } from "./annotate.ts";
import type { SpecDocument, SpecEndpoint } from "./endpoints.ts";
import {
	inferSchema,
	type JsonSchema,
	orderSchemaKeys,
	relaxNullOnly,
} from "./json-schema.ts";

export interface OpenApiParameter {
	name: string;
	in: "query";
	required: boolean;
	description?: string;
	schema: JsonSchema;
	example?: unknown;
}

export interface OpenApiOperation {
	operationId: string;
	summary: string;
	description?: string;
	tags: string[];
	parameters?: OpenApiParameter[];
	security: Record<string, string[]>[];
	requestBody?: {
		required: true;
		content: Record<string, { schema: JsonSchema; example?: unknown }>;
	};
	responses: Record<
		string,
		{
			description: string;
			content?: Record<string, { schema: JsonSchema; example?: unknown }>;
		}
	>;
	servers?: { url: string }[];
}

export interface OpenApiDocument {
	openapi: "3.1.0";
	"x-generated-by": string;
	info: { title: string; version: string; description?: string };
	servers: { url: string }[];
	tags: { name: string; description?: string }[];
	paths: Record<string, Record<string, OpenApiOperation>>;
	components: { securitySchemes: Record<string, unknown> };
}

interface DraftResponse {
	status: number;
	description: string;
	example?: unknown;
	schema?: JsonSchema;
}

interface Draft {
	endpoint: SpecEndpoint;
	origin: string;
	pathname: string;
	query: [string, string][];
	requestSchema?: JsonSchema;
	responses: DraftResponse[];
	paramsNode: JsonSchema;
	warnings: string[];
}

const GENERATOR = "scripts/build-nuvio-spec.ts";

function camelCase(text: string): string {
	const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
	return words
		.map((word, index) =>
			index === 0
				? word.toLowerCase()
				: word[0].toUpperCase() + word.slice(1).toLowerCase(),
		)
		.join("");
}

function splitUrl(url: string): {
	origin: string;
	pathname: string;
	query: [string, string][];
} {
	const absolute = url.startsWith("http");
	const parsed = new URL(url, "https://placeholder.invalid");
	return {
		origin: absolute ? parsed.origin : "",
		pathname: parsed.pathname,
		query: [...parsed.searchParams.entries()],
	};
}

function securityFor(endpoint: SpecEndpoint): Record<string, string[]>[] {
	const names = Object.keys(endpoint.headers).map((name) => name.toLowerCase());
	const scheme: Record<string, string[]> = {};
	if (names.includes("authorization")) {
		scheme.bearerAuth = [];
	}
	if (names.includes("apikey")) {
		scheme.apiKey = [];
	}
	return Object.keys(scheme).length > 0 ? [scheme] : [];
}

function mediaType(endpoint: SpecEndpoint): string {
	const header = Object.entries(endpoint.headers).find(
		([name]) => name.toLowerCase() === "content-type",
	);
	return header?.[1] ?? "application/json";
}

function makeDraft(endpoint: SpecEndpoint): Draft {
	const { origin, pathname, query } = splitUrl(endpoint.url);
	const paramsNode: JsonSchema = {
		type: "object",
		properties: Object.fromEntries(
			query.map(([name]) => [name, { type: "string" } as JsonSchema]),
		),
	};
	const requestSchema =
		endpoint.requestExample === undefined
			? undefined
			: relaxNullOnly(inferSchema(endpoint.requestExample));
	const roots: JsonSchema[] = [paramsNode];
	if (requestSchema) {
		roots.push(requestSchema);
	}
	const responses: DraftResponse[] = endpoint.responses.map((response) => ({
		...response,
		schema:
			response.example === undefined
				? undefined
				: relaxNullOnly(inferSchema(response.example)),
	}));
	for (const response of responses) {
		if (response.schema) {
			roots.push(response.schema);
		}
	}
	const unmatched = applyTables(roots, endpoint.tables);
	return {
		endpoint,
		origin,
		pathname,
		query,
		requestSchema,
		responses,
		paramsNode,
		warnings: unmatched.map(
			(table) =>
				`${endpoint.method} ${endpoint.url}: table "${table.caption || "(untitled)"}" matched no schema`,
		),
	};
}

/** Query values are always strings in the URL; the table may type them tighter. */
function coerceExample(value: string, schema: JsonSchema): unknown {
	const types = Array.isArray(schema.type) ? schema.type : [schema.type];
	if (types.includes("integer") || types.includes("number")) {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? value : parsed;
	}
	if (types.includes("boolean") && (value === "true" || value === "false")) {
		return value === "true";
	}
	return value;
}

function parametersOf(draft: Draft, fixed: boolean): OpenApiParameter[] {
	const documented = draft.paramsNode.properties ?? {};
	const required = new Set(draft.paramsNode.required ?? []);
	return draft.query.map(([name, value]) => {
		const documentedSchema = documented[name] ?? { type: "string" };
		const description = documentedSchema.description;
		const schema: JsonSchema = { ...documentedSchema, description: undefined };
		if (fixed) {
			// The query value is what selects this operation (`?grant_type=…`).
			schema.type = "string";
			schema.const = value;
		}
		return {
			name,
			in: "query" as const,
			required: fixed || required.has(name),
			...(description ? { description } : {}),
			schema: orderSchemaKeys(schema),
			example: coerceExample(value, schema),
		};
	});
}

function responsesOf(drafts: Draft[]): OpenApiOperation["responses"] {
	const responses: OpenApiOperation["responses"] = {};
	for (const draft of drafts) {
		for (const response of draft.responses) {
			const key = String(response.status);
			const existing = responses[key];
			const content = response.schema
				? {
						"application/json": {
							schema: orderSchemaKeys(response.schema),
							example: response.example,
						},
					}
				: undefined;
			if (!existing) {
				responses[key] = {
					description: response.description,
					...(content ? { content } : {}),
				};
			} else if (content && !existing.content) {
				existing.content = content;
			}
		}
	}
	if (Object.keys(responses).length === 0) {
		responses["204"] = { description: "No Content" };
	}
	return responses;
}

function requestBodyOf(drafts: Draft[]): OpenApiOperation["requestBody"] {
	const withBody = drafts.filter((draft) => draft.requestSchema);
	if (withBody.length === 0) {
		return undefined;
	}
	const type = mediaType(withBody[0].endpoint);
	if (withBody.length === 1) {
		return {
			required: true,
			content: {
				[type]: {
					schema: orderSchemaKeys(withBody[0].requestSchema as JsonSchema),
					example: withBody[0].endpoint.requestExample,
				},
			},
		};
	}
	// Same route, different documented payloads (single vs. batch delete).
	return {
		required: true,
		content: {
			[type]: {
				schema: orderSchemaKeys({
					oneOf: withBody.map((draft) => ({
						title: draft.endpoint.title,
						...(draft.requestSchema as JsonSchema),
					})),
				}),
			},
		},
	};
}

function describe(drafts: Draft[]): string {
	return [...new Set(drafts.map((draft) => draft.endpoint.description))]
		.filter(Boolean)
		.join("\n\n");
}

function buildOperation(
	drafts: Draft[],
	fixedQuery: boolean,
	operationId: string,
): OpenApiOperation {
	const first = drafts[0].endpoint;
	const description = describe(drafts);
	const parameters = parametersOf(drafts[0], fixedQuery);
	const requestBody = requestBodyOf(drafts);
	return {
		operationId,
		summary: drafts.map((draft) => draft.endpoint.title).join(" / "),
		...(description ? { description } : {}),
		tags: [first.tag],
		...(parameters.length > 0 ? { parameters } : {}),
		security: securityFor(first),
		...(drafts[0].origin ? { servers: [{ url: drafts[0].origin }] } : {}),
		...(requestBody ? { requestBody } : {}),
		responses: responsesOf(drafts),
	};
}

function groupKey(draft: Draft): string {
	return `${draft.endpoint.method} ${draft.origin}${draft.pathname}`;
}

function queryKey(draft: Draft): string {
	return draft.query.map(([name, value]) => `${name}=${value}`).join("&");
}

function uniqueId(base: string, fallback: string, used: Set<string>): string {
	let id = used.has(base) && fallback !== "" ? fallback : base;
	let suffix = 2;
	while (used.has(id)) {
		id = `${base}${suffix}`;
		suffix++;
	}
	used.add(id);
	return id;
}

export function buildOpenApi(spec: SpecDocument): {
	document: OpenApiDocument;
	warnings: string[];
} {
	const drafts = spec.endpoints.map(makeDraft);
	const warnings = [...spec.warnings, ...drafts.flatMap((d) => d.warnings)];
	const groups = new Map<string, Draft[]>();
	for (const draft of drafts) {
		const key = groupKey(draft);
		groups.set(key, [...(groups.get(key) ?? []), draft]);
	}

	const paths: OpenApiDocument["paths"] = {};
	const usedIds = new Set<string>();

	for (const group of groups.values()) {
		const byQuery = new Map<string, Draft[]>();
		for (const draft of group) {
			const key = queryKey(draft);
			byQuery.set(key, [...(byQuery.get(key) ?? []), draft]);
		}
		// One route documented under several query strings stays several
		// operations; OpenAPI keys on path alone, so the query rides along.
		const fixedQuery = byQuery.size > 1;
		for (const [query, variants] of byQuery) {
			const first = variants[0];
			const pathKey =
				fixedQuery && query !== ""
					? `${first.pathname}?${query}`
					: first.pathname;
			const route = camelCase(first.pathname.split("/").at(-1) ?? "");
			// Several payloads on one route: the route name beats either title.
			const base =
				variants.length > 1 ? route : camelCase(first.endpoint.title);
			const operation = buildOperation(
				variants,
				fixedQuery,
				uniqueId(base, route, usedIds),
			);
			paths[pathKey] = {
				...paths[pathKey],
				[first.endpoint.method.toLowerCase()]: operation,
			};
			if (variants.length > 1) {
				warnings.push(
					`${first.endpoint.method} ${pathKey}: merged ${variants.length} documented payloads into oneOf`,
				);
			}
			if (pathKey !== first.pathname) {
				warnings.push(
					`${first.endpoint.method} ${pathKey}: query kept in the path key so the documented operations stay distinct (OpenAPI has no other way to key them)`,
				);
			}
		}
	}

	return {
		document: {
			openapi: "3.1.0",
			"x-generated-by": GENERATOR,
			info: {
				title: spec.title,
				version: spec.version,
				...(spec.description ? { description: spec.description } : {}),
			},
			servers: [{ url: spec.baseUrl }],
			tags: spec.tags
				.filter((tag) =>
					spec.endpoints.some((endpoint) => endpoint.tag === tag.name),
				)
				.map((tag) => ({
					name: tag.name,
					...(tag.description ? { description: tag.description } : {}),
				})),
			paths,
			components: {
				securitySchemes: {
					bearerAuth: {
						type: "http",
						scheme: "bearer",
						description: "Supabase access token from the auth endpoints.",
					},
					apiKey: {
						type: "apiKey",
						in: "header",
						name: "apikey",
						description: "Nuvio publishable key.",
					},
				},
			},
		},
		warnings,
	};
}
