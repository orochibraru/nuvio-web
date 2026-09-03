/**
 * Applies the spec's field / parameter tables to the schemas inferred from
 * the JSON examples.
 *
 * A table is matched to the schema node it describes by overlap, not by name
 * alone : "Folder object" and "Collection JSON fields" both document an `id`
 * and a `title`, so binding each table to its best-matching node is what keeps
 * the nested collection schemas honest.
 */

import type { SpecTable } from "./endpoints.ts";
import {
	type JsonSchema,
	mergeSchemas,
	parseDocumentedType,
} from "./json-schema.ts";

interface Candidate {
	schema: JsonSchema;
	depth: number;
}

export interface DocumentedField {
	name: string;
	schema: JsonSchema | null;
	description: string;
	required: boolean;
	default?: unknown;
}

const NAME_CELL = /^`?([A-Za-z_][\w.]*)`?$/;

function firstValue(row: Record<string, string>, keys: string[]): string {
	for (const key of keys) {
		if (row[key] !== undefined && row[key] !== "") {
			return row[key];
		}
	}
	return "";
}

function parseDefault(cell: string): unknown {
	const text = cell.replace(/`/g, "").trim();
	if (text === "" || /^(required|—|-|n\/a)$/i.test(text)) {
		return undefined;
	}
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

export function readTable(table: SpecTable): DocumentedField[] {
	const fields: DocumentedField[] = [];
	for (const row of table.rows) {
		const rawName = firstValue(row, ["field", "parameter", "name", "key"]);
		const name = rawName.match(NAME_CELL)?.[1];
		if (!name) {
			continue;
		}
		const defaultCell = row.default ?? "";
		const requiredCell = row.required ?? "";
		fields.push({
			name,
			schema: parseDocumentedType(row.type ?? ""),
			description: firstValue(row, ["description", "meaning", "behavior"]),
			required:
				/^yes$/i.test(requiredCell.trim()) ||
				/^required$/i.test(defaultCell.replace(/`/g, "").trim()),
			default: parseDefault(defaultCell),
		});
	}
	return fields;
}

function collectCandidates(
	schema: JsonSchema,
	depth: number,
	out: Candidate[],
): void {
	if (schema.properties) {
		out.push({ schema, depth });
		for (const child of Object.values(schema.properties)) {
			collectCandidates(child, depth + 1, out);
		}
	}
	if (schema.items) {
		collectCandidates(schema.items, depth + 1, out);
	}
	if (schema.additionalProperties) {
		collectCandidates(schema.additionalProperties, depth + 1, out);
	}
}

interface Score {
	/** Share of the table's fields the node has. */
	recall: number;
	/** Share of the node's properties the table documents. */
	precision: number;
}

function score(candidate: Candidate, fields: DocumentedField[]): Score {
	const properties = candidate.schema.properties ?? {};
	const names = Object.keys(properties);
	const hits = fields.filter((field) =>
		Object.hasOwn(properties, field.name),
	).length;
	return {
		recall: hits / fields.length,
		precision: names.length === 0 ? 0 : hits / names.length,
	};
}

/**
 * Recall first, then precision: a one-field "Part object" table matches both
 * the part and its parent on recall, and only the part on precision.
 */
function isBetter(next: Score, best: Score, closer: boolean): boolean {
	if (next.recall !== best.recall) {
		return next.recall > best.recall;
	}
	if (next.precision !== best.precision) {
		return next.precision > best.precision;
	}
	return closer;
}

function annotateField(node: JsonSchema, field: DocumentedField): void {
	const properties = node.properties ?? {};
	const existing = properties[field.name];
	const target = existing ?? field.schema ?? {};
	if (field.schema) {
		// The table is authoritative about type and nullability; the example
		// only ever shows one branch of a union.
		const inferredOnly: JsonSchema = {
			...target,
			type: undefined,
			format: undefined,
		};
		properties[field.name] = mergeSchemas(inferredOnly, field.schema);
	} else {
		properties[field.name] = target;
	}
	if (field.description !== "") {
		properties[field.name].description = field.description;
	}
	if (field.default !== undefined) {
		properties[field.name].default = field.default;
	}
	node.properties = properties;
}

/**
 * @returns the tables that matched nothing, so the CLI can report them
 * instead of silently dropping documentation.
 */
export function applyTables(
	roots: JsonSchema[],
	tables: SpecTable[],
): SpecTable[] {
	const candidates: Candidate[] = [];
	for (const root of roots) {
		collectCandidates(root, 0, candidates);
	}
	const unmatched: SpecTable[] = [];

	for (const table of tables) {
		const fields = readTable(table);
		if (fields.length === 0) {
			continue;
		}
		let best: Candidate | null = null;
		let bestScore: Score = { recall: 0, precision: 0 };
		for (const candidate of candidates) {
			const value = score(candidate, fields);
			if (
				best === null ||
				isBetter(value, bestScore, candidate.depth < best.depth)
			) {
				best = candidate;
				bestScore = value;
			}
		}
		if (!best || bestScore.recall === 0) {
			unmatched.push(table);
			continue;
		}
		const node = best.schema;
		const required = new Set(node.required ?? []);
		for (const field of fields) {
			const known = Object.hasOwn(node.properties ?? {}, field.name);
			// Only trust a table enough to introduce new properties when it
			// clearly describes this node.
			if (!known && bestScore.recall < 0.5) {
				continue;
			}
			annotateField(node, field);
			if (field.required) {
				required.add(field.name);
			}
		}
		if (required.size > 0) {
			node.required = [...required].sort();
		}
	}

	return unmatched;
}
