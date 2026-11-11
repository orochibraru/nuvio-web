import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DOWNLOADS } from "#lib/downloads/tokens.js";
import { Container } from "#lib/services/index.js";
import { GET } from "./+server.ts";

const BYTES = "0123456789";

let folder: string;
let found: { path: string; mimeType: string | null } | null;

beforeEach(async () => {
	folder = await mkdtemp(join(tmpdir(), "nuvio-local-file-"));
	await writeFile(join(folder, "media"), BYTES);
	found = { path: join(folder, "media"), mimeType: "video/webm" };
});

afterEach(async () => {
	await rm(folder, { recursive: true, force: true });
});

function get(path: string, range?: string) {
	const queue = { file: vi.fn(async () => found) };
	const response = GET({
		locals: {
			services: new Container("test").provide(LOCAL_DOWNLOADS, queue as never),
			session: { accountKey: "account-1" },
			profileId: 1,
		},
		params: { id: "abc", path },
		request: new Request("http://localhost/x", {
			headers: range ? { range } : {},
		}),
	} as never) as Promise<Response>;
	return { response, queue };
}

describe("GET /api/downloads/local/[id]/[...path]", () => {
	it("serves the whole file as sandboxed media", async () => {
		const { response, queue } = get("media");
		const answer = await response;

		expect(queue.file).toHaveBeenCalledWith("account-1:1", "abc", "media");
		expect(answer.status).toBe(200);
		expect(answer.headers.get("content-type")).toBe("video/webm");
		expect(answer.headers.get("content-length")).toBe("10");
		expect(answer.headers.get("accept-ranges")).toBe("bytes");
		expect(answer.headers.get("content-security-policy")).toBe(
			"sandbox; default-src 'none'",
		);
		expect(answer.headers.get("x-content-type-options")).toBe("nosniff");
		expect(await answer.text()).toBe(BYTES);
	});

	it("serves a byte range so the video seeks", async () => {
		const answer = await get("media", "bytes=2-5").response;

		expect(answer.status).toBe(206);
		expect(answer.headers.get("content-range")).toBe("bytes 2-5/10");
		expect(answer.headers.get("content-length")).toBe("4");
		expect(await answer.text()).toBe("2345");
	});

	it("refuses a range past the end", async () => {
		const answer = await get("media", "bytes=20-30").response;

		expect(answer.status).toBe(416);
		expect(answer.headers.get("content-range")).toBe("bytes */10");
	});

	it("is a 404 for a file the profile doesn't own", async () => {
		found = null;
		await expect(get("media").response).rejects.toMatchObject({ status: 404 });
	});

	it("is a 404 when the file is gone from disk", async () => {
		await rm(join(folder, "media"));
		await expect(get("media").response).rejects.toMatchObject({ status: 404 });
	});
});
