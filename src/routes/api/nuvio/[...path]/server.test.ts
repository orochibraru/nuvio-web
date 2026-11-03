import { describe, expect, it, vi } from "vitest";
import { BUILT_IN_BACKEND } from "#lib/backend/tokens.js";
import { Container } from "#lib/services/index.js";
import { fallback } from "./+server.ts";

describe("/api/nuvio/[...path]", () => {
	it("hands the request and the client address to the built-in backend", async () => {
		const handle = vi.fn(async () => new Response("ok"));
		const request = new Request("http://localhost/api/nuvio/rest/v1/rpc/x");
		const response = await fallback({
			request,
			locals: {
				services: new Container("test").provide(BUILT_IN_BACKEND, {
					handle,
				} as never),
			},
			getClientAddress: () => "203.0.113.9",
		} as never);
		expect(await response.text()).toBe("ok");
		expect(handle).toHaveBeenCalledWith(request, "203.0.113.9");
	});
});
