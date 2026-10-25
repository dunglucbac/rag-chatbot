# Deployment

## Local Development

### 1. Start the database

```bash
docker-compose up -d
```

### 2. Run the app

```bash
npm run start:dev
```

---

## Production (Docker)

Use the production overlay to put Traefik in front of the application:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
```

Requires Docker Compose v2.24.4 or newer for the overlay's `!reset` tags.
Set these values in `.env` when running manually, or in the `Prod` GitHub Actions
environment when using the [Windows deployment workflow](deployment-github-actions.md):

```dotenv
DUCKDNS_SUBDOMAIN=lqtragchatbot
DUCKDNS_TOKEN=<your DuckDNS account token>
ACME_EMAIL=<your email for Let's Encrypt>
GOOGLE_CALLBACK_URL=https://lqtragchatbot.duckdns.org/auth/google/callback
```

The request path is `https://lqtragchatbot.duckdns.org:443` → Traefik →
`app:${PORT:-3000}` over the Docker network. HTTP on port 80 redirects to HTTPS.
The overlay removes the app's published host port and development bind mount,
and runs the compiled production image. The base Compose file still supports
local development with `docker compose up -d`.

Traefik obtains and renews a Let's Encrypt certificate using DuckDNS DNS-01.
Certificate state lives in the `letsencrypt` named volume; retain it across
redeployments and avoid `docker compose down --volumes`. The DuckDNS updater
refreshes the public IPv4 address every five minutes. It does not update IPv6;
remove any stale DuckDNS AAAA record if it points somewhere else.
See the [Traefik ACME reference](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/)
and [DuckDNS updater documentation](https://docs.linuxserver.io/images/docker-duckdns/).

The host must accept inbound TCP 80 and 443, including any Windows firewall,
cloud firewall, and router/NAT forwarding. DuckDNS supplies DNS records; it
cannot create an inbound route through CGNAT or a Windows 365 network without
public ingress. DNS-01 can issue a certificate without inbound access, but
clients still need to reach port 443. Stop the old Cloudflare Tunnel after
verifying the DuckDNS URL works from outside the host's network. Register the
HTTPS callback above as an authorized redirect URI in Google Cloud.

Only the app exposes HTTP in this repository. The Python workers use RabbitMQ
and have no HTTP port to route. Database and RabbitMQ connections continue
using their configured endpoints.

For another HTTP container, attach it to `ip6net` and add its own Traefik router
and service labels. Set `loadbalancer.server.port` to that container's listening
port. For example, a container serving `/reports` on port 8080 can use:

```yaml
networks:
  - ip6net
labels:
  traefik.enable: 'true'
  traefik.http.routers.reports.rule: Host(`${DUCKDNS_SUBDOMAIN}.duckdns.org`) && PathPrefix(`/reports`)
  traefik.http.routers.reports.entrypoints: websecure
  traefik.http.routers.reports.tls.certresolver: duckdns
  traefik.http.routers.reports.service: reports
  traefik.http.services.reports.loadbalancer.server.port: '8080'
```

Traefik preserves `/reports` in the upstream request. Add a StripPrefix middleware
if that service expects paths from `/`. No extra host port needs publishing.

After deployment, use the same two `-f` arguments for `ps`, `logs`, and `down`.
Verify `http://<subdomain>.duckdns.org/auth/google` redirects to HTTPS, and
`https://<subdomain>.duckdns.org/auth/google` redirects to Google with the HTTPS
callback in `redirect_uri`.

---

## Environment Checklist

Before deploying, confirm:

- [ ] `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set (matching `LLM_PROVIDER`)
- [ ] `OPENAI_API_KEY` is always set — required for embeddings regardless of LLM provider
- [ ] `TAVILY_API_KEY` is set
- [ ] `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, and
  `OBJECT_STORAGE_BUCKET` identify the private S3-compatible bucket
- [ ] `OBJECT_STORAGE_ACCESS_KEY` and `OBJECT_STORAGE_SECRET_KEY` can read and
  write that bucket (for DigitalOcean Spaces, use its Spaces access keys)
- [ ] Set `OBJECT_STORAGE_FORCE_PATH_STYLE=true` only for providers such as
  MinIO that require path-style S3 addressing
- [ ] Configure bucket CORS to allow your client origin to `PUT` directly to
  the signed upload URL with the `Content-Type` header
- [ ] `DB_*` variables match your production database credentials
- [ ] PostgreSQL has the pgvector extension enabled (`init.sql` handles this on first run)

---

## Caveats

- `TypeORM synchronize: true` is enabled — fine for development, but replace with migrations before going to production to avoid accidental schema changes on deploy.
- The background scraper cron runs inside the app process. If you scale to multiple instances, each will run the scraper independently and may scrape the same URLs concurrently. Use a single scraper instance or add a distributed lock if you scale horizontally.
- Failed scrape attempts are logged and skipped with no retry. Permanently unreachable URLs will remain `scraped: false` indefinitely.
- Uploads are staged in `/tmp`, then persisted to S3-compatible object storage.
  Configure a bucket lifecycle policy to delete raw originals after the required
  retention period.
- Drain or explicitly fail any pending jobs created before this migration: their
  former local filesystem paths are not valid object storage keys.
