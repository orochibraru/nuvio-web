<script lang="ts">
	let { class: className = "" }: { class?: string } = $props();

	// Well-known titles, by IMDb id: the posters Cinemeta's catalogs point at.
	const TITLES = [
		"tt0137523",
		"tt0903747",
		"tt1375666",
		"tt0944947",
		"tt6751668",
		"tt0111161",
		"tt4574334",
		"tt0816692",
		"tt0141842",
		"tt1160419",
		"tt0068646",
		"tt7660850",
		"tt0133093",
		"tt11280740",
		"tt15398776",
		"tt0468569",
		"tt3032476",
		"tt0245429",
		"tt7366338",
		"tt1856101",
		"tt0110912",
		"tt14452776",
		"tt0120737",
		"tt2543164",
		"tt1392190",
		"tt0172495",
		"tt4633694",
		"tt6710474",
		"tt2582802",
		"tt0088763",
	];
	// The logo's hues, painted while a poster loads (or if it never does).
	const HUES = [205, 255, 272, 293, 330];
	const COLUMNS = 6;
	const PER_COLUMN = TITLES.length / COLUMNS;

	function tile(column: number, row: number) {
		const seed = column * 7 + row * 3;
		const from = HUES[seed % HUES.length] as number;
		const to = HUES[(seed + 2) % HUES.length] as number;
		return {
			poster: `https://images.metahub.space/poster/small/${TITLES[column * PER_COLUMN + row]}/img`,
			background: `linear-gradient(160deg, oklch(0.42 0.18 ${from}), oklch(0.24 0.14 ${to}))`,
		};
	}

	const columns = Array.from({ length: COLUMNS }, (_, column) => {
		const tiles = Array.from({ length: PER_COLUMN }, (_, row) =>
			tile(column, row),
		);
		return {
			// Twice over, so sliding by half loops without a seam.
			tiles: [...tiles, ...tiles],
			duration: 70 + ((column * 17) % 40),
			reverse: column % 2 === 1,
		};
	});
</script>

<div aria-hidden="true" class={`poster-wall pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
	<div class="absolute inset-[-20%] flex -rotate-12 gap-4">
		{#each columns as column, index (index)}
			<div
				class="poster-column flex flex-1 flex-col gap-4"
				class:reverse={column.reverse}
				style:animation-duration={`${column.duration}s`}
			>
				{#each column.tiles as poster, row (row)}
					<div
						class="relative aspect-2/3 w-full shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10"
						style:background={poster.background}
					>
						<img
							src={poster.poster}
							alt=""
							decoding="async"
							class="size-full object-cover"
							onerror={(event) => event.currentTarget.remove()}
						/>
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	/* Fades into the page through a mask, so whatever paints behind (the aurora) shows through without a seam. */
	.poster-wall {
		mask-image: linear-gradient(to bottom, #000 30%, transparent 95%);
	}
	@media (min-width: 48rem) {
		.poster-wall {
			mask-image:
				linear-gradient(to right, #000 40%, transparent 98%),
				linear-gradient(to bottom, #000 45%, transparent 100%);
			mask-composite: intersect;
		}
	}
	.poster-column {
		animation: poster-drift linear infinite;
	}
	.poster-column.reverse {
		animation-direction: reverse;
	}
	@media (prefers-reduced-motion: reduce) {
		.poster-column {
			animation: none;
		}
	}
	@keyframes poster-drift {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-50%);
		}
	}
</style>
