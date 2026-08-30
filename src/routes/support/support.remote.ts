import * as v from "valibot";
import { getRequestEvent, query } from "$app/server";

const PAGE_SIZE = 24;

export const supporterWall = query(
	v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
	async (offset) => {
		const { locals } = getRequestEvent();
		try {
			const wall = await locals.nuvio.getSupporterWall({
				limit: PAGE_SIZE,
				offset,
			});
			return {
				ok: true as const,
				top: wall.top,
				recent: wall.recent,
				offset: wall.pagination.offset,
				pageSize: wall.pagination.limit,
			};
		} catch {
			return { ok: false as const };
		}
	},
);
