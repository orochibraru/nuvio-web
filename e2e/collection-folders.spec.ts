import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

/**
 * Folders end to end: add (with a tile), edit, reorder, switch layout. Works on
 * a throwaway collection and deletes it afterwards : the e2e account is shared
 * and its collections blob is a single full-replace document.
 */

test.beforeEach(async ({ context }) => {
	await signIn(context);
});

async function addFolder(
	page: Page,
	folder: { name: string; emoji?: string; shape?: "Landscape" | "Square" },
) {
	await page.getByRole("button", { name: "Add folder" }).first().click();
	const dialog = page.getByRole("dialog", { name: "Add folder" });
	await dialog.getByLabel("Name").fill(folder.name);
	if (folder.emoji) {
		await dialog.getByLabel("Emoji").fill(folder.emoji);
	}
	if (folder.shape) {
		await dialog.getByRole("radio", { name: folder.shape }).click();
	}
	await dialog
		.getByRole("group", { name: "Catalogs" })
		.getByRole("checkbox")
		.first()
		.click();
	await dialog.getByRole("button", { name: "Add", exact: true }).click();
	await expect(dialog).toBeHidden();
}

async function deleteCollection(page: Page, name: string) {
	await page.goto("/collections");
	// The card is the element holding both the collection's link and its menu.
	const card = page
		.getByRole("main")
		.locator("div")
		.filter({ has: page.getByRole("link", { name: new RegExp(name) }) })
		.filter({ has: page.getByRole("button", { name: "Collection actions" }) })
		.last();
	if (!(await card.isVisible().catch(() => false))) {
		return;
	}
	await card.getByRole("button", { name: "Collection actions" }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await expect(page.getByText(name)).toBeHidden();
}

test("collection folders: add with a tile, reorder, switch layout", async ({
	page,
}) => {
	test.setTimeout(90_000);
	const errors = collectRuntimeErrors(page);
	const name = `e2e folders ${Date.now()}`;

	try {
		await page.goto("/collections");
		await page.getByRole("button", { name: "New collection" }).click();
		await page.getByPlaceholder("Collection name").fill(name);
		await page.getByRole("button", { name: "Create" }).click();
		await page.getByRole("link", { name: new RegExp(name) }).click();
		await expect(page.getByRole("heading", { name })).toBeVisible();

		await addFolder(page, { name: "Alpha", emoji: "🚀", shape: "Landscape" });
		await addFolder(page, { name: "Beta" });

		// Alpha has art, so it is a tile named by its title; Beta is a pill.
		const alpha = page.getByRole("button", { name: "Alpha", exact: true });
		const beta = page.getByRole("button", { name: "Beta", exact: true });
		await expect(alpha).toBeVisible();
		await expect(beta).toBeVisible();
		await expect(alpha).toHaveClass(/aspect-video/);

		// Move Beta ahead of Alpha from its edit dialog.
		await beta.click();
		await page.getByRole("button", { name: "Edit folder Beta" }).click();
		const edit = page.getByRole("dialog", { name: "Edit folder" });
		await edit.getByRole("button", { name: "Move folder earlier" }).click();
		await expect
			.poll(async () => {
				const [a, b] = await Promise.all([
					alpha.boundingBox(),
					beta.boundingBox(),
				]);
				return a && b ? b.x < a.x : false;
			})
			.toBe(true);

		// Hide Beta's title (it is a pill, so the label stays) and save.
		await edit.getByLabel("Hide the title on the tile").click();
		await edit.getByRole("button", { name: "Save" }).click();
		await expect(edit).toBeHidden();
		await expect(beta).toBeVisible();

		const { violations } = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
			.analyze();
		expect(violations.map((violation) => violation.id)).toEqual([]);

		// Rows: every folder as its own labelled section.
		await page.getByRole("radio", { name: "Rows" }).click();
		await expect(page.getByRole("region", { name: "Alpha" })).toBeVisible();
		await expect(page.getByRole("region", { name: "Beta" })).toBeVisible();

		// Default follows this client's layout, which is tabs.
		await page.getByRole("radio", { name: "Default" }).click();
		await expect(page.getByRole("radio", { name: "Default" })).toHaveAttribute(
			"aria-checked",
			"true",
		);
		await expect(alpha).toBeVisible();
	} finally {
		await deleteCollection(page, name);
	}

	expect(errors, "runtime errors").toEqual([]);
});
