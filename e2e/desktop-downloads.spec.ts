import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";
import { E2E_SESSION_SECRET } from "./session-secret.ts";

/**
 * The desktop app's downloads: the e2e image run again, beside the main one,
 * with `NUVIO_DOWNLOADS_DIR`, so its server downloads into a folder and plays
 * the files back from there. A port of its own: the main run keeps :3000.
 *
 * The source is the fixture as GitHub serves it from `main`: the server's SSRF
 * guard refuses a source on localhost, which the desktop app never has either.
 */
const CONTAINER = "nuvio-e2e-desktop";
const PORT = 3017;
const ORIGIN = `http://localhost:${PORT}`;
const FOLDER = "/app/data/downloads";
const SOURCE =
	"https://raw.githubusercontent.com/orochibraru/nuvio-web/main/static/e2e/sample.webm";
const SAMPLE_SIZE = statSync(
	new URL("../static/e2e/sample.webm", import.meta.url),
).size;

function docker(...args: string[]): string {
	return execFileSync("docker", args, { encoding: "utf8" });
}

/** A container left by a run that was killed, or none. */
function removeContainer(): void {
	try {
		docker("rm", "--force", CONTAINER);
	} catch {
		// Nothing to remove.
	}
}

test.use({ baseURL: ORIGIN });

test.beforeAll(async () => {
	test.setTimeout(90_000);
	// The image the main run built, whatever it is tagged.
	const image = docker("inspect", "--format", "{{.Image}}", "nuvio-e2e").trim();
	removeContainer();
	docker(
		"run",
		"--detach",
		"--name",
		CONTAINER,
		"--publish",
		`${PORT}:3000`,
		"--env",
		"NUVIO_E2E=1",
		"--env",
		`NUVIO_SESSION_SECRET=${E2E_SESSION_SECRET}`,
		"--env",
		`NUVIO_DOWNLOADS_DIR=${FOLDER}`,
		image,
	);
	await expect
		.poll(
			() =>
				fetch(`${ORIGIN}/api/health`).then(
					(response) => response.ok,
					() => false,
				),
			{ timeout: 60_000 },
		)
		.toBe(true);
});

test.afterAll(removeContainer);

test("desktop downloads: into the folder, with the addon's headers, played back and removed", async ({
	page,
	context,
}) => {
	test.setTimeout(120_000);
	await signIn(context);
	const errors = collectRuntimeErrors(page);

	// A bad name, a `Host` and a CR / LF never reach the host: the download
	// only succeeds when they were dropped.
	const headers = {
		"User-Agent": "NuvioE2E/1",
		Host: "evil.example",
		"X-Injected": "a\r\nx-other: b",
		"bad name": "x",
	};
	await page.goto(
		`/dev/downloads?${new URLSearchParams({
			src: SOURCE,
			id: "e2e-disk",
			headers: JSON.stringify(headers),
		})}`,
	);
	await page.getByRole("button", { name: "Download Sample" }).click();
	const done = page.locator('[data-video="e2e-disk"]');
	await expect(done).toBeAttached({ timeout: 60_000 });
	const local = (await done.getAttribute("data-local")) as string;
	expect(local).toMatch(/^\/api\/downloads\/local\/[0-9a-f-]{36}\//);

	// Served from the folder, whole and by range.
	const whole = await page.request.get(local);
	expect(whole.status()).toBe(200);
	expect(whole.headers()["content-type"]).toContain("video/webm");
	expect((await whole.body()).byteLength).toBe(SAMPLE_SIZE);
	const part = await page.request.get(local, {
		headers: { range: "bytes=0-9" },
	});
	expect(part.status()).toBe(206);
	expect((await part.body()).byteLength).toBe(10);

	// On disk, named like a library's, the checked headers kept for a resume.
	const listing = (await (
		await page.request.get("/api/downloads/local")
	).json()) as {
		folder: string;
		items: { id: string; folder: string; entry: string }[];
	};
	expect(listing.folder).toBe(FOLDER);
	const [record] = listing.items;
	const directory = `${FOLDER}/${record.folder}`;
	expect(docker("exec", CONTAINER, "ls", "-A", directory).split("\n")).toEqual(
		expect.arrayContaining([".nuvio.json", record.entry]),
	);
	const saved = JSON.parse(
		docker("exec", CONTAINER, "cat", `${directory}/.nuvio.json`),
	) as { requestHeaders?: Record<string, string> };
	expect(saved.requestHeaders).toEqual({ "user-agent": "NuvioE2E/1" });

	// The Downloads page lists the folder, and in the app offers to change it.
	await context.addInitScript(() => {
		const sent: unknown[] = [];
		Object.assign(window, {
			__sent: sent,
			nuvioDesktop: {
				openDownloads: () => sent.push("open"),
				chooseDownloadsFolder: () => sent.push("choose"),
				resetDownloadsFolder: () => sent.push("default"),
				defaultDownloadsFolder: "/home/someone/Videos/Nuvio Web",
			},
		});
	});
	await page.goto("/downloads");
	await expect(page.getByText(`In ${FOLDER},`)).toBeVisible();
	await page.getByRole("button", { name: "Change folder" }).click();
	await page.getByRole("button", { name: "Use the default folder" }).click();
	expect(
		await page.evaluate(() => (window as { __sent?: unknown[] }).__sent),
	).toEqual(["choose", "default"]);

	// Deleting it takes the folder off the disk.
	await page.getByRole("button", { name: "Delete Sample e2e-disk" }).click();
	await page
		.getByRole("button", { name: "Confirm deleting Sample e2e-disk" })
		.click();
	await expect(page.getByText("Sample e2e-disk")).toHaveCount(0);
	expect(docker("exec", CONTAINER, "ls", "-A", FOLDER).trim()).toBe("");

	expect(errors).toEqual([]);
});
