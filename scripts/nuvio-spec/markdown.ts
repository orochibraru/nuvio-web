/**
 * A deliberately small block lexer for the Nuvio spec markdown.
 *
 * It only recognises the constructs the spec actually uses to describe
 * endpoints : headings, fenced code, `**Label:**` lines and pipe tables.
 * Everything else collapses into `paragraph` blocks, which keeps the
 * endpoint walker in `endpoints.ts` free of markdown trivia.
 */

export interface HeadingBlock {
	kind: "heading";
	depth: number;
	text: string;
}

export interface FenceBlock {
	kind: "fence";
	lang: string;
	body: string;
}

export interface LabelBlock {
	kind: "label";
	label: string;
	trailing: string;
}

export interface TableBlock {
	kind: "table";
	headers: string[];
	rows: string[][];
}

export interface ParagraphBlock {
	kind: "paragraph";
	text: string;
}

export type Block =
	| HeadingBlock
	| FenceBlock
	| LabelBlock
	| TableBlock
	| ParagraphBlock;

const HEADING = /^(#{1,6})\s+(.*)$/;
const LABEL = /^\*\*(.+):\*\*\s*(.*)$/;
const FENCE = /^```(\S*)\s*$/;
const TABLE_DIVIDER = /^\|[\s:|-]+\|$/;

/**
 * Split one table row into cells, honouring the `\|` escape the spec uses
 * inside union types (`string \| null`). A naive `.split("|")` shreds those.
 */
export function splitTableRow(line: string): string[] {
	const cells: string[] = [];
	let cell = "";
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === "\\" && line[i + 1] === "|") {
			cell += "|";
			i++;
			continue;
		}
		if (char === "|") {
			cells.push(cell);
			cell = "";
			continue;
		}
		cell += char;
	}
	cells.push(cell);
	// The outer pipes produce an empty cell at each end.
	return cells.slice(1, -1).map((value) => value.trim());
}

function isTableStart(lines: string[], index: number): boolean {
	return (
		lines[index].startsWith("|") &&
		index + 1 < lines.length &&
		TABLE_DIVIDER.test(lines[index + 1].trim())
	);
}

function readFence(lines: string[], start: number): [FenceBlock, number] {
	const lang = lines[start].trim().match(FENCE)?.[1] ?? "";
	const body: string[] = [];
	let index = start + 1;
	while (index < lines.length && !FENCE.test(lines[index].trim())) {
		body.push(lines[index]);
		index++;
	}
	return [{ kind: "fence", lang, body: body.join("\n") }, index + 1];
}

function readTable(lines: string[], start: number): [TableBlock, number] {
	const headers = splitTableRow(lines[start].trim());
	const rows: string[][] = [];
	let index = start + 2;
	while (index < lines.length && lines[index].trim().startsWith("|")) {
		rows.push(splitTableRow(lines[index].trim()));
		index++;
	}
	return [{ kind: "table", headers, rows }, index];
}

/** True where a paragraph must stop: a blank line or the start of another block. */
function endsParagraph(lines: string[], index: number): boolean {
	const trimmed = lines[index].trim();
	return (
		trimmed === "" ||
		HEADING.test(trimmed) ||
		FENCE.test(trimmed) ||
		LABEL.test(trimmed) ||
		isTableStart(lines, index)
	);
}

function readParagraph(lines: string[], start: number): [string, number] {
	const text: string[] = [];
	let index = start;
	while (index < lines.length && !endsParagraph(lines, index)) {
		// Blockquote callouts are prose; keep the text, drop the marker.
		text.push(lines[index].trim().replace(/^>\s?/, ""));
		index++;
	}
	return [text.join(" "), index];
}

export function tokenize(markdown: string): Block[] {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index];
		const trimmed = line.trim();

		if (trimmed === "" || trimmed === "---") {
			index++;
			continue;
		}

		const heading = trimmed.match(HEADING);
		if (heading) {
			blocks.push({
				kind: "heading",
				depth: heading[1].length,
				text: heading[2].trim(),
			});
			index++;
			continue;
		}

		if (FENCE.test(trimmed)) {
			const [block, next] = readFence(lines, index);
			blocks.push(block);
			index = next;
			continue;
		}

		const label = trimmed.match(LABEL);
		if (label) {
			// `**Note:** text` that wraps onto the next line is still one
			// paragraph. Folding the continuation into `trailing` is what makes
			// the parse independent of how the prose happens to be wrapped.
			const [continuation, next] = readParagraph(lines, index + 1);
			blocks.push({
				kind: "label",
				label: label[1].trim(),
				trailing: [label[2].trim(), continuation].filter(Boolean).join(" "),
			});
			index = next;
			continue;
		}

		if (isTableStart(lines, index)) {
			const [block, next] = readTable(lines, index);
			blocks.push(block);
			index = next;
			continue;
		}

		const [text, next] = readParagraph(lines, index);
		if (text !== "") {
			blocks.push({ kind: "paragraph", text });
		}
		index = next > index ? next : index + 1;
	}

	return blocks;
}
