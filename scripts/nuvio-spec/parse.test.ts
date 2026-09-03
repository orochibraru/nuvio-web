import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyTables } from "./annotate.ts";
import { parseSpec } from "./endpoints.ts";
import { specToOpenApi } from "./index.ts";
import {
	inferSchema,
	mergeSchemas,
	parseDocumentedType,
	relaxNullOnly,
} from "./json-schema.ts";
import { splitTableRow, tokenize } from "./markdown.ts";

const FIXTURE = `# Example API

> **Version:** 2.1 &middot; **Base URL:**
> \`https://api.example.com\`

Prose introducing the API for third-party clients that need a long enough lead
paragraph to be recognised as the description.

## Widgets

Widgets are things.

### Get widget

This endpoint returns one widget.

\`\`\`
POST /rest/v1/rpc/get_widget
Content-Type: application/json
Authorization: Bearer <access_token>
apikey: <publishable_key>
\`\`\`

**Request body:**

\`\`\`json
{
  "p_widget_id": 1,
  "p_platform": "tv"
}
\`\`\`

**Parameters:**

| Parameter      | Type    | Default  | Description         |
| -------------- | ------- | -------- | ------------------- |
| \`p_widget_id\`  | integer | Required | Widget identifier   |
| \`p_platform\`   | string  | \`tv\`     | Platform namespace  |

**Response (\`200\`):**

\`\`\`json
[
  { "id": "uuid", "label": "One", "size": null, "parts": [{ "id": "p1" }] },
  { "id": "uuid", "label": "Two", "size": 3, "parts": [] }
]
\`\`\`

**Response fields:**

| Field   | Type              | Description       |
| ------- | ----------------- | ----------------- |
| \`id\`    | uuid              | Widget ID         |
| \`label\` | string \\| null    | Display label     |
| \`size\`  | integer \\| null   | Optional size     |

**Part object:**

| Field | Type   | Description |
| ----- | ------ | ----------- |
| \`id\`  | string | Part ID     |

### Delete widget

\`\`\`
POST /rest/v1/rpc/delete_widget
Authorization: Bearer <access_token>
\`\`\`

**Request body:**

\`\`\`json
{ "p_widget_id": 1 }
\`\`\`

**Response:** \`204 No Content\`
`;

describe("markdown lexer", () => {
	it("keeps escaped pipes inside a table cell", () => {
		expect(splitTableRow("| `size` | integer \\| null | Optional |")).toEqual([
			"`size`",
			"integer | null",
			"Optional",
		]);
	});

	it("classifies the blocks the spec is written from", () => {
		const kinds = tokenize(FIXTURE).map((block) => block.kind);
		expect(kinds).toContain("heading");
		expect(kinds).toContain("fence");
		expect(kinds).toContain("label");
		expect(kinds).toContain("table");
	});

	it("folds a blockquote callout into one clean paragraph", () => {
		expect(tokenize("> **Note:** careful\n> with this one.")).toEqual([
			{ kind: "paragraph", text: "**Note:** careful with this one." },
		]);
	});
});

describe("parseSpec", () => {
	const spec = parseSpec(FIXTURE);

	it("reads the document header", () => {
		expect(spec.title).toBe("Example API");
		expect(spec.version).toBe("2.1");
		expect(spec.baseUrl).toBe("https://api.example.com");
		expect(spec.description).toMatch(/^Prose introducing/);
	});

	it("collects one endpoint per request block", () => {
		expect(spec.endpoints.map((endpoint) => endpoint.url)).toEqual([
			"/rest/v1/rpc/get_widget",
			"/rest/v1/rpc/delete_widget",
		]);
	});

	it("keeps headers, lead prose and both tables", () => {
		const [widget] = spec.endpoints;
		expect(widget.method).toBe("POST");
		expect(widget.tag).toBe("Widgets");
		expect(widget.title).toBe("Get widget");
		expect(widget.description).toBe("This endpoint returns one widget.");
		expect(widget.headers.Authorization).toBe("Bearer <access_token>");
		expect(widget.requestExample).toEqual({ p_widget_id: 1, p_platform: "tv" });
		expect(widget.tables.map((table) => table.caption)).toEqual([
			"Parameters",
			"Response fields",
			"Part object",
		]);
	});

	it("reads inline response statuses", () => {
		expect(spec.endpoints[1].responses).toEqual([
			{ status: 204, description: "No Content" },
		]);
	});

	it("ignores the `<placeholder>` syntax templates", () => {
		const templated = parseSpec(
			"## X\n\n```\nPOST /rest/v1/rpc/<function_name>\n```\n",
		);
		expect(templated.endpoints).toEqual([]);
	});
});

describe("schema inference", () => {
	it("widens a field that is null in one example and typed in another", () => {
		const merged = relaxNullOnly(inferSchema([{ size: null }, { size: 3 }]));
		expect(merged.items?.properties?.size.type).toEqual(["null", "integer"]);
	});

	it("drops the type of a field that is null everywhere", () => {
		expect(relaxNullOnly(inferSchema({ a: null })).properties?.a).toEqual({});
	});

	it("treats an all-numeric key set as a map", () => {
		const schema = inferSchema({ "1": 5, "2": 3 });
		expect(schema.properties).toBeUndefined();
		expect(schema.additionalProperties).toEqual({ type: "integer" });
	});

	it("separates integers from fractional numbers", () => {
		expect(inferSchema(3).type).toBe("integer");
		expect(inferSchema(8.8).type).toBe("number");
	});

	it("merges object properties from every array element", () => {
		const merged = mergeSchemas(inferSchema({ a: 1 }), inferSchema({ b: "x" }));
		expect(Object.keys(merged.properties ?? {})).toEqual(["a", "b"]);
	});
});

describe("documented types", () => {
	it.each([
		["uuid", { type: "string", format: "uuid" }],
		["timestamp", { type: "string", format: "date-time" }],
		["string | null", { type: ["string", "null"] }],
		["float | null", { type: ["number", "null"] }],
		["string[]", { type: "array", items: { type: "string" } }],
		["json", {}],
	])("parses %s", (input, expected) => {
		expect(parseDocumentedType(input)).toEqual(expected);
	});

	it("returns null for prose in the type column", () => {
		expect(parseDocumentedType("library item fields")).toBeNull();
	});
});

describe("table binding", () => {
	it("binds a table to the node it actually describes", () => {
		const root = inferSchema({
			outer: [{ id: "o1", folders: [{ id: "f1", title: "T" }] }],
		});
		const unmatched = applyTables(
			[root],
			[
				{
					caption: "Folder object",
					rows: [
						{ field: "`id`", type: "string", description: "Folder ID" },
						{ field: "`title`", type: "string", description: "Folder name" },
					],
				},
			],
		);
		expect(unmatched).toEqual([]);
		const outer = root.properties?.outer.items;
		expect(outer?.properties?.id.description).toBeUndefined();
		expect(outer?.properties?.folders.items?.properties?.id.description).toBe(
			"Folder ID",
		);
	});

	it("reports a table that matches nothing", () => {
		const root = inferSchema({ a: 1 });
		expect(
			applyTables([root], [{ caption: "Other", rows: [{ field: "`z`" }] }]),
		).toHaveLength(1);
	});
});

describe("specToOpenApi", () => {
	const { document } = specToOpenApi(FIXTURE);
	const widget = document.paths["/rest/v1/rpc/get_widget"].post;

	it("names operations from their heading", () => {
		expect(widget.operationId).toBe("getWidget");
		expect(widget.tags).toEqual(["Widgets"]);
	});

	it("derives security from the request headers", () => {
		expect(widget.security).toEqual([{ bearerAuth: [], apiKey: [] }]);
		expect(document.paths["/rest/v1/rpc/delete_widget"].post.security).toEqual([
			{ bearerAuth: [] },
		]);
	});

	it("carries required flags and defaults from the parameter table", () => {
		const schema = widget.requestBody?.content["application/json"].schema ?? {};
		expect(schema.required).toEqual(["p_widget_id"]);
		expect(schema.properties?.p_platform.default).toBe("tv");
		expect(schema.properties?.p_widget_id.description).toBe(
			"Widget identifier",
		);
	});

	it("annotates the response schema and keeps the example", () => {
		const media = widget.responses["200"].content?.["application/json"];
		const item = media?.schema.items;
		expect(item?.properties?.id).toEqual({
			type: "string",
			format: "uuid",
			description: "Widget ID",
		});
		expect(item?.properties?.size.type).toEqual(["integer", "null"]);
		expect(Array.isArray(media?.example)).toBe(true);
	});

	it("documents a void endpoint as 204", () => {
		expect(
			document.paths["/rest/v1/rpc/delete_widget"].post.responses["204"],
		).toEqual({ description: "No Content" });
	});
});

describe("the committed Nuvio snapshot", () => {
	const markdown = readFileSync(
		fileURLToPath(
			new URL(
				"../../src/lib/nuvio/nuvio-public-api.snapshot.md",
				import.meta.url,
			),
		),
		"utf8",
	);
	const spec = parseSpec(markdown);
	const { document, warnings } = specToOpenApi(markdown);

	it("finds every documented endpoint", () => {
		// 40 request blocks in the prose, two of which are syntax templates.
		expect(spec.endpoints).toHaveLength(38);
	});

	it("leaves no field table unmodelled", () => {
		expect(
			warnings.filter((line) => line.includes("matched no schema")),
		).toEqual([]);
	});

	it("gives every operation a unique id and at least one response", () => {
		const operations = Object.values(document.paths).flatMap((item) =>
			Object.values(item),
		);
		const ids = operations.map((operation) => operation.operationId);
		expect(new Set(ids).size).toBe(ids.length);
		for (const operation of operations) {
			expect(Object.keys(operation.responses).length).toBeGreaterThan(0);
		}
	});

	it("models the overloaded delete route as a oneOf", () => {
		const schema =
			document.paths["/rest/v1/rpc/sync_delete_watch_progress"].post.requestBody
				?.content["application/json"].schema;
		expect(schema?.oneOf).toHaveLength(2);
	});
});
