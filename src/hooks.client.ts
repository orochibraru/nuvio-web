import type { HandleClientError } from "@sveltejs/kit";
import { dev } from "$app/environment";

function makeid(length: number) {
	let result = "";
	const characters =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const charactersLength = characters.length;
	for (let i = 0; i < length; i += 1) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

export const handleError: HandleClientError = ({ error, event, message }) => {
	const errorId = makeid(24);

	console.error("An error occurred on the client side:", error, event, message);

	if (dev) {
		if (error instanceof Error) {
			return {
				errorId,
				message: error.message,
			};
		}

		return {
			errorId,
			message: String(error),
		};
	}

	return {
		errorId,
		message: "Whoops!",
	};
};
