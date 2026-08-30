# Nuvio Web

Unofficial implementation of the [Nuvio](https://nuvio.tv/) API in a web UI
(since there is none, yet).

## Disclaimer

Nuvio Web hosts no media. All catalogs, metadata, streams and subtitles come
from **addons** — the Stremio addon protocol — which **you install and are
responsible for**. The app is a shell around whatever those addons return; it
does not endorse, index, or verify any addon or its content. Use only addons you
have the right to use in your jurisdiction. Not affiliated with or endorsed by
Nuvio.

## Getting Started

### Docker run

```bash
docker run -p 3000:3000 orochibraru/nuvio-web:latest
```

### Docker Compose

```yaml
services:
  nuvio:
    image: orochibraru/nuvio-web:latest
    restart: unless-stopped
    ports:
      - 3000:3000
    healthcheck:
      interval: 30s
      retries: 3
      start_period: 5s
      test: ["CMD", "/app/build/healthcheck"]
      timeout: 30s
```

## Development

See [contributing.md](CONTRIBUTING.md)

## License

[AGPL-3.0-or-later](LICENSE). If you run a modified version as a network
service, you must offer its source to your users.
