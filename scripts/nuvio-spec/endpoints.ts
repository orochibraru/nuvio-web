/**
 * Walks the block stream from `markdown.ts` and pulls out one record per
 * documented endpoint: the request line, its headers, the JSON examples and
 * every field / parameter table that belongs to it.
 */
import { type Block, tokenize } from "./markdown.ts";

export interface SpecTable {
	caption: string;
	rows: Record<string, string>[];
}

export interface SpecResponse {
	status: number;
	description: string;
	example?: unknown;
}

export interface SpecEndpoint {
	tag: string;
	title: string;
	description: string;
	method: string;
	url: string;
	headers: Record<string, string>;
	requestExample?: unknown;
	tables: SpecTable[];
	responses: SpecResponse[];
}

export interface SpecDocument {
	title: string;
	version: string;
	description: string;
	baseUrl: string;
	tags: { name: string; description: string }[];
	endpoints: SpecEndpoint[];
	warnings: string[];
}

const REQUEST_LINE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)$/;
const RESPONSE_LABEL = /^Response\s*\(`(\d{3})`\)$/;
const STATUS_TRAILING = /`(\d{3})[^`]*`|^(\d{3})\b/;
/** Tables we care about all name their subject in the first column. */
const FIELD_COLUMNS = new Set(["field", "parameter", "name", "key"]);

const STATUS_TEXT: Record<number, string> = {
	200: "Success",
	201: "Created",
	204: "No Content",
};

function parseHeaders(lines: string[]): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const line of lines) {
		const match = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
		if (match) {
			headers[match[1]] = match[2].trim();
		}
	}
	return headers;
}

function parseJson(body: string, warnings: string[], where: string): unknown {
	try {
		return JSON.parse(body) as unknown;
	} catch {
		warnings.push(`${where}: unparseable JSON example`);
		return undefined;
	}
}

function toRows(headers: string[], rows: string[][]): Record<string, string>[] {
	const keys = headers.map((header) => header.trim().toLowerCase());
	return rows.map((cells) => {
		const row: Record<string, string> = {};
		keys.forEach((key, index) => {
			row[key] = cells[index] ?? "";
		});
		return row;
	});
}

function isFieldTable(headers: string[]): boolean {
	return FIELD_COLUMNS.has((headers[0] ?? "").trim().toLowerCase());
}

class EndpointCollector {
	public readonly endpoints: SpecEndpoint[] = [];
	public readonly warnings: string[] = [];
	public tag = "";
	public title = "";
	/** Prose seen since the last endpoint, waiting for the endpoint it leads into. */
	public lead: string[] = [];
	public current: SpecEndpoint | null = null;
	public pending: "request" | "response" | "table" | null = null;
	public caption = "";

	/** Prose after an endpoint belongs to it, unless another endpoint follows. */
	public flushLead(): void {
		if (this.current && this.lead.length > 0) {
			this.current.description = [this.current.description, ...this.lead]
				.filter(Boolean)
				.join("\n\n");
		}
		this.lead = [];
	}

	public close(): void {
		this.flushLead();
		this.current = null;
		this.pending = null;
		this.caption = "";
	}

	public open(method: string, url: string, headerLines: string[]): void {
		const lead = this.lead;
		this.current = null;
		this.lead = [];
		const endpoint: SpecEndpoint = {
			tag: this.tag,
			title: this.title,
			description: lead.join("\n\n"),
			method,
			url,
			headers: parseHeaders(headerLines),
			tables: [],
			responses: [],
		};
		this.endpoints.push(endpoint);
		this.current = endpoint;
		this.pending = null;
		this.caption = "";
	}
}

function handleLabel(
	collector: EndpointCollector,
	label: string,
	trailing: string,
): void {
	collector.flushLead();
	const response = label.match(RESPONSE_LABEL);
	if (response) {
		const status = Number(response[1]);
		collector.current?.responses.push({
			status,
			description: trailing || STATUS_TEXT[status] || "",
		});
		collector.pending = "response";
		return;
	}
	if (label === "Response") {
		const match = trailing.match(STATUS_TRAILING);
		const status = Number(match?.[1]?.slice(0, 3) ?? match?.[2] ?? 200);
		collector.current?.responses.push({
			status,
			description:
				trailing
					.replace(/[`]/g, "")
					.replace(/^\d{3}\s*/, "")
					.trim() ||
				STATUS_TEXT[status] ||
				"",
		});
		collector.pending = "response";
		return;
	}
	if (label === "Request body") {
		collector.pending = "request";
		return;
	}
	collector.pending = "table";
	collector.caption = label;
	if (trailing !== "" && collector.current) {
		collector.lead.push(`**${label}:** ${trailing}`);
	}
}

function handleFence(
	collector: EndpointCollector,
	lang: string,
	body: string,
): void {
	const lines = body.split("\n");
	const request = lines[0]?.trim().match(REQUEST_LINE);
	// `<function_name>` / `<table_name>` blocks are syntax templates, not endpoints.
	if (lang === "" && request && !request[2].includes("<")) {
		collector.open(request[1], request[2], lines.slice(1));
		return;
	}
	if (lang !== "json" || !collector.current) {
		return;
	}
	const where = `${collector.current.method} ${collector.current.url}`;
	if (collector.pending === "request") {
		collector.current.requestExample = parseJson(
			body,
			collector.warnings,
			where,
		);
	} else if (collector.pending === "response") {
		const last = collector.current.responses.at(-1);
		if (last) {
			last.example = parseJson(body, collector.warnings, where);
		}
	}
	collector.pending = null;
}

function handleBlock(collector: EndpointCollector, block: Block): void {
	switch (block.kind) {
		case "heading": {
			collector.close();
			if (block.depth <= 2) {
				collector.tag = block.text;
			}
			if (block.depth <= 3) {
				collector.title = block.text;
			}
			break;
		}
		case "fence": {
			handleFence(collector, block.lang, block.body);
			break;
		}
		case "label": {
			handleLabel(collector, block.label, block.trailing);
			break;
		}
		case "table": {
			if (collector.current && isFieldTable(block.headers)) {
				collector.current.tables.push({
					caption: collector.pending === "table" ? collector.caption : "",
					rows: toRows(block.headers, block.rows),
				});
			}
			collector.pending = null;
			collector.caption = "";
			break;
		}
		default: {
			collector.lead.push(block.text);
			collector.pending = null;
			break;
		}
	}
}

function readTags(blocks: Block[]): { name: string; description: string }[] {
	const tags: { name: string; description: string }[] = [];
	blocks.forEach((block, index) => {
		if (block.kind !== "heading" || block.depth !== 2) {
			return;
		}
		const next = blocks[index + 1];
		tags.push({
			name: block.text,
			description: next?.kind === "paragraph" ? next.text : "",
		});
	});
	return tags;
}

export function parseSpec(markdown: string): SpecDocument {
	const blocks = tokenize(markdown);
	const collector = new EndpointCollector();
	for (const block of blocks) {
		handleBlock(collector, block);
	}
	collector.close();

	const heading = blocks.find(
		(block) => block.kind === "heading" && block.depth === 1,
	);
	// The lead paragraph under the H1 : skip the `**Version:** …` callout.
	const intro = blocks.find(
		(block) =>
			block.kind === "paragraph" &&
			block.text.length > 80 &&
			!block.text.startsWith("**"),
	);

	return {
		title: heading?.kind === "heading" ? heading.text : "API",
		version: markdown.match(/\*\*Version:\*\*\s*([^\s·&]+)/)?.[1] ?? "0.0",
		description: intro?.kind === "paragraph" ? intro.text : "",
		baseUrl:
			markdown.match(/\*\*Base URL:\*\*\s*>?\s*`([^`]+)`/)?.[1] ??
			"https://api.nuvio.tv",
		tags: readTags(blocks),
		endpoints: collector.endpoints,
		warnings: collector.warnings,
	};
}
