/**
 * Schema inference.
 *
 * Structure comes from the JSON examples in the spec (they are the only
 * complete description of a payload); the field / parameter tables then
 * annotate that structure with documented types, nullability, defaults,
 * descriptions and which fields are required.
 */

export interface JsonSchema {
	title?: string;
	type?: string | string[];
	const?: unknown;
	oneOf?: JsonSchema[];
	format?: string;
	description?: string;
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema;
	additionalProperties?: JsonSchema;
	propertyNames?: JsonSchema;
	default?: unknown;
}

const NUMERIC_KEY = /^\d+$/;

/** Documented type token -> schema fragment. `json` stays open on purpose. */
const TYPE_TOKENS: Record<string, JsonSchema> = {
	uuid: { type: "string", format: "uuid" },
	timestamp: { type: "string", format: "date-time" },
	string: { type: "string" },
	text: { type: "string" },
	integer: { type: "integer" },
	int: { type: "integer" },
	number: { type: "number" },
	float: { type: "number" },
	boolean: { type: "boolean" },
	bool: { type: "boolean" },
	object: { type: "object" },
	array: { type: "array" },
	null: { type: "null" },
	json: {},
};

function typeList(schema: JsonSchema): string[] {
	if (schema.type === undefined) {
		return [];
	}
	return Array.isArray(schema.type) ? schema.type : [schema.type];
}

function setTypes(schema: JsonSchema, types: string[]): void {
	const unique = [...new Set(types)];
	schema.type =
		unique.length === 0 ? undefined : unique.length === 1 ? unique[0] : unique;
}

export function mergeSchemas(a: JsonSchema, b: JsonSchema): JsonSchema {
	const merged: JsonSchema = { ...a };
	setTypes(merged, [...typeList(a), ...typeList(b)]);
	merged.format = a.format ?? b.format;
	if (a.properties || b.properties) {
		const properties: Record<string, JsonSchema> = { ...a.properties };
		for (const [key, value] of Object.entries(b.properties ?? {})) {
			properties[key] = properties[key]
				? mergeSchemas(properties[key], value)
				: value;
		}
		merged.properties = properties;
	}
	if (a.items || b.items) {
		merged.items =
			a.items && b.items
				? mergeSchemas(a.items, b.items)
				: (a.items ?? b.items);
	}
	if (a.additionalProperties || b.additionalProperties) {
		merged.additionalProperties =
			a.additionalProperties && b.additionalProperties
				? mergeSchemas(a.additionalProperties, b.additionalProperties)
				: (a.additionalProperties ?? b.additionalProperties);
	}
	return merged;
}

function inferObject(value: Record<string, unknown>): JsonSchema {
	const keys = Object.keys(value);
	// `{"1": 5, "2": 3}` is a profile-index map, not a two-field object.
	if (keys.length > 1 && keys.every((key) => NUMERIC_KEY.test(key))) {
		return {
			type: "object",
			propertyNames: { type: "string" },
			additionalProperties: keys
				.map((key) => inferSchema(value[key]))
				.reduce(mergeSchemas),
		};
	}
	const properties: Record<string, JsonSchema> = {};
	for (const key of keys) {
		properties[key] = inferSchema(value[key]);
	}
	return { type: "object", properties };
}

export function inferSchema(value: unknown): JsonSchema {
	if (value === null) {
		return { type: "null" };
	}
	if (Array.isArray(value)) {
		const items = value.map(inferSchema);
		return {
			type: "array",
			items: items.length === 0 ? {} : items.reduce(mergeSchemas),
		};
	}
	switch (typeof value) {
		case "boolean": {
			return { type: "boolean" };
		}
		case "number": {
			return { type: Number.isInteger(value) ? "integer" : "number" };
		}
		case "object": {
			return inferObject(value as Record<string, unknown>);
		}
		default: {
			return { type: "string" };
		}
	}
}

/** A field that is `null` in every example carries no type information. */
export function relaxNullOnly(schema: JsonSchema): JsonSchema {
	if (schema.properties) {
		for (const [key, value] of Object.entries(schema.properties)) {
			schema.properties[key] = relaxNullOnly(value);
		}
	}
	if (schema.items) {
		schema.items = relaxNullOnly(schema.items);
	}
	if (schema.additionalProperties) {
		schema.additionalProperties = relaxNullOnly(schema.additionalProperties);
	}
	if (schema.type === "null" && !schema.properties && !schema.items) {
		return { ...schema, type: undefined };
	}
	return schema;
}

export function parseDocumentedType(cell: string): JsonSchema | null {
	const text = cell.replace(/`/g, "").trim().toLowerCase();
	if (text === "") {
		return null;
	}
	const parts = text.split("|").map((part) => part.trim());
	let schema: JsonSchema = {};
	let known = false;
	for (const part of parts) {
		const arrayOf = part.match(/^(\w+)\[\]$/);
		if (arrayOf && Object.hasOwn(TYPE_TOKENS, arrayOf[1])) {
			schema = mergeSchemas(schema, {
				type: "array",
				items: TYPE_TOKENS[arrayOf[1]],
			});
			known = true;
			continue;
		}
		if (Object.hasOwn(TYPE_TOKENS, part)) {
			schema = mergeSchemas(schema, TYPE_TOKENS[part]);
			known = true;
		}
	}
	return known ? schema : null;
}

const KEY_ORDER = [
	"title",
	"type",
	"format",
	"const",
	"default",
	"description",
	"required",
	"properties",
	"items",
	"additionalProperties",
	"propertyNames",
	"oneOf",
];

/** Stable key order keeps the generated JSON diffable across runs. */
export function orderSchemaKeys(schema: JsonSchema): JsonSchema {
	const source = schema as Record<string, unknown>;
	const keys = Object.keys(source).sort((a, b) => {
		const left = KEY_ORDER.indexOf(a);
		const right = KEY_ORDER.indexOf(b);
		return (
			(left === -1 ? KEY_ORDER.length : left) -
			(right === -1 ? KEY_ORDER.length : right)
		);
	});
	const ordered: Record<string, unknown> = {};
	for (const key of keys) {
		const value = source[key];
		if (key === "properties") {
			const properties: Record<string, JsonSchema> = {};
			for (const [name, child] of Object.entries(
				value as Record<string, JsonSchema>,
			)) {
				properties[name] = orderSchemaKeys(child);
			}
			ordered[key] = properties;
		} else if (key === "oneOf") {
			ordered[key] = (value as JsonSchema[]).map(orderSchemaKeys);
		} else if (
			key === "items" ||
			key === "additionalProperties" ||
			key === "propertyNames"
		) {
			ordered[key] = orderSchemaKeys(value as JsonSchema);
		} else {
			ordered[key] = value;
		}
	}
	return ordered as JsonSchema;
}
