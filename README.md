# Nuvio Web

Unofficial implementation of the [Nuvio](https://nuvio.tv/) API in a web UI
(since there is none, yet).

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
