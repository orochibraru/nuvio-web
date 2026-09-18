/**
 * Recovers enums the spec only states in prose.
 *
 * The spec never writes `enum`; it describes a closed set in the field's
 * description instead: "`movie` or `series`", "`POSTER`, `LANDSCAPE`, or
 * `SQUARE`". A description that is *nothing but* such a list is taken as the
 * field's complete set of values. One that only gives examples ("Content type
 * (e.g. `movie`, `series`)") is not, and stays a plain string.
 *
 * The same field is not described everywhere it appears (`content_type` has
 * the list on the library push but no description on the delta feed), so a
 * set learned for a field name applies to every string property of that name
 * in the document. A name documented with two *different* sets is left alone:
 * the spec disagrees with itself, and a guess would be worse than a string.
 */
import type { JsonSchema } from "./json-schema.ts";
import type { OpenApiDocument } from "./openapi.ts";

/** "`a` or `b`", "`a`, `b`, or `c`", "`a`, `b`, `c`" : and nothing else. */
const EXHAUSTIVE_LIST = /^`[^`]+`(?:,? (?:or )?`[^`]+`)+\.?$/;

export function enumFromDescription(
	description: string | undefined,
): string[] | null {
	const text = description?.trim() ?? "";
	if (!EXHAUSTIVE_LIST.test(text)) {
		return null;
	}
	return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function isStringish(schema: JsonSchema): boolean {
	const types = Array.isArray(schema.type) ? schema.type : [schema.type];
	return types.includes("string");
}

function isNullable(schema: JsonSchema): boolean {
	return Array.isArray(schema.type) && schema.type.includes("null");
}

/** Every schema in the document, request bodies, responses and parameters. */
function* schemasOf(document: OpenApiDocument): Generator<JsonSchema> {
	for (const item of Object.values(document.paths)) {
		for (const operation of Object.values(item)) {
			for (const media of Object.values(operation.requestBody?.content ?? {})) {
				yield media.schema;
			}
			for (const response of Object.values(operation.responses)) {
				for (const media of Object.values(response.content ?? {})) {
					yield media.schema;
				}
			}
		}
	}
}

/** Each named property below `schema`, depth first. */
function* propertiesOf(schema: JsonSchema): Generator<[string, JsonSchema]> {
	for (const [name, child] of Object.entries(schema.properties ?? {})) {
		yield [name, child];
		yield* propertiesOf(child);
	}
	for (const child of [
		schema.items,
		schema.additionalProperties,
		...(schema.oneOf ?? []),
	]) {
		if (child) {
			yield* propertiesOf(child);
		}
	}
}

/** Adds `enum` in place. Returns the field names it learned, for the report. */
export function inferEnums(
	document: OpenApiDocument,
): Record<string, string[]> {
	const learned = new Map<string, string[] | "conflict">();
	for (const root of schemasOf(document)) {
		for (const [name, schema] of propertiesOf(root)) {
			const values = isStringish(schema)
				? enumFromDescription(schema.description)
				: null;
			if (!values) {
				continue;
			}
			const known = learned.get(name);
			if (known === undefined) {
				learned.set(name, values);
			} else if (known !== "conflict" && known.join("|") !== values.join("|")) {
				learned.set(name, "conflict");
			}
		}
	}

	for (const root of schemasOf(document)) {
		for (const [name, schema] of propertiesOf(root)) {
			const values = learned.get(name);
			if (values && values !== "conflict" && isStringish(schema)) {
				schema.enum = isNullable(schema) ? [...values, null] : [...values];
			}
		}
	}

	const report: Record<string, string[]> = {};
	for (const [name, values] of learned) {
		if (values !== "conflict") {
			report[name] = values;
		}
	}
	return report;
}
