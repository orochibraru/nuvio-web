import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "#lib/services/index.js";
import {
	addLocalDownload,
	pauseLocalDownload,
	removeLocalDownload,
	resumeLocalDownload,
} from "./local-downloads.remote.ts";
import { LOCAL_DOWNLOADS } from "./tokens.ts";

const { event } = vi.hoisted(() => ({ event: { locals: {} as App.Locals } }));

vi.mock("$app/server", () => ({
	command: (_schema: unknown, fn: unknown) => fn,
	getRequestEvent: () => event,
}));

const ID = "0b9c4f3e-6a51-4c1e-9d6f-2f7c1b8a9e10";
const OWNER = "account-1:2";

function fakeQueue() {
	return {
		folder: "/Users/me/Movies/Nuvio",
		add: vi.fn(async () => {}),
		pause: vi.fn(async () => {}),
		resume: vi.fn(async () => {}),
		remove: vi.fn(async () => {}),
		list: vi.fn(async () => [{ id: ID }]),
		free: vi.fn(async () => 1024),
	};
}

let queue: ReturnType<typeof fakeQueue>;

// `command` is mocked to hand back the handler itself.
const call = (handler: unknown, input: unknown) =>
	(handler as (input: unknown) => Promise<unknown>)(input);

function signedIn(services: Container) {
	event.locals = {
		services,
		session: { accountKey: "account-1" },
		profileId: 2,
	} as never;
}

beforeEach(() => {
	queue = fakeQueue();
	signedIn(new Container("test").provide(LOCAL_DOWNLOADS, queue as never));
});

const listing = {
	items: [{ id: ID }],
	folder: "/Users/me/Movies/Nuvio",
	free: 1024,
};

describe("local download commands", () => {
	it("adds a download for the signed-in profile and answers the list", async () => {
		const input = { title: "Dune" };
		expect(await call(addLocalDownload, input)).toEqual(listing);
		expect(queue.add).toHaveBeenCalledWith(OWNER, input);
		expect(queue.list).toHaveBeenCalledWith(OWNER);
	});

	it.each([
		["pauses", pauseLocalDownload, "pause"],
		["resumes", resumeLocalDownload, "resume"],
		["removes", removeLocalDownload, "remove"],
	] as const)("%s the profile's download", async (_, run, method) => {
		expect(await call(run, ID)).toEqual(listing);
		expect(queue[method]).toHaveBeenCalledWith(OWNER, ID);
	});

	it("is a 404 where the server keeps no downloads folder", async () => {
		signedIn(new Container("test").provide(LOCAL_DOWNLOADS, null));
		await expect(call(pauseLocalDownload, ID)).rejects.toMatchObject({
			status: 404,
		});
	});
});
