import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
	// Optional, server-only. Raises the TheIntroDB rate/usage limits for
	// skip-intro; the endpoint works keyless too, so `undefined` is fine.
	INTRODB_API_KEY: { schema: (value) => value },
});
