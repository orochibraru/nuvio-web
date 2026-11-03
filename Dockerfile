# Builder : glibc Bun image so the compiled binary is glibc-linked and runs on
# debian:slim below.
FROM oven/bun:1 AS build

WORKDIR /app

COPY ./package.json ./bun.lock /app/
COPY ./patches /app/patches

RUN bun install --frozen-lockfile --ignore-scripts

COPY . /app/

RUN bun run build

# Runtime : no Bun, no node_modules. @sveltejs/adapter-bun compiles the app
# (Bun runtime embedded) into the single self-contained /app/dist/server binary.
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 10001 app

WORKDIR /app

COPY --from=build --chown=app:app /app/build /app/dist

RUN mkdir -p /app/data && chown -R app:app /app/data

USER app

# An open tab holds `/api/events` until the drain deadline: keep it under the
# 10 s `docker stop` gives before SIGKILL, so the shutdown hook still runs.
ENV SHUTDOWN_TIMEOUT=8

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=1s \
    CMD ["curl", "-fsS", "http://localhost:3000/api/health"]

CMD ["/app/dist/server"]
