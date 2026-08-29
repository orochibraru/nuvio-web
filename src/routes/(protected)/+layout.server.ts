import { resolve } from "$app/paths"
import { redirect } from "@sveltejs/kit"

export const load = () => {
    const isSignedin = false

    if (!isSignedin) {
        return redirect(307, resolve("/auth/sign-in"))
    }

    return {
        user: {
            name: "Test"
        }
    }
}
