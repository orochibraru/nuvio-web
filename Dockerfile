# Builder : glibc Bun image so the compiled binary is glibc-linked and runs on
# debian:slim below.
FROM oven/bun:1 AS build

WORKDIR /app

COPY ./package.json ./bun.lock /app/

RUN bun install --frozen-lockfile --ignore-scripts

COPY . /app/

RUN bun run build

# Runtime : no Bun, no node_modules. @orochibraru/svelte-smol compiles the app
# (Bun runtime embedded) into the single self-contained /app/dist/server binary.
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 app

WORKDIR /app

COPY --from=build --chown=app:app /app/build /app/dist

RUN mkdir -p /app/data && chown -R app:app /app/data

USER app

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=1s \
    CMD ["/app/dist/healthcheck"]

CMD ["/app/dist/server"]
