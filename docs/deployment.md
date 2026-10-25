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

Start the app and workers with the standard Compose file:

```powershell
docker compose up --detach --build --remove-orphans
```

The app is available to a local Cloudflare Tunnel at `http://localhost:3000`.
The Windows 365 Microsoft Hosted Network does not accept direct inbound
connections, so DuckDNS or an open Windows Firewall rule cannot make this host
publicly reachable. Use Cloudflare Tunnel, which connects outward from the
Cloud PC.

A Quick Tunnel can be started manually for temporary testing:

```powershell
cloudflared tunnel --url http://localhost:3000
```

It prints a temporary `trycloudflare.com` hostname that changes each time the
tunnel starts. Google OAuth requires the callback URL to exactly match a URI
registered for the client, so a changing Quick Tunnel URL requires manually
updating the Google OAuth client in Cloud Console and the deployed
`GOOGLE_CALLBACK_URL` each time. Google does not provide an API for changing
redirect URIs on standard web OAuth clients. Use a named Cloudflare Tunnel with
a stable hostname for sign-in that survives restarts. Configure its published
application route to the local app origin and set the exact callback once:

```text
https://<stable-hostname>/auth/google/callback
```

Register that URL in Google Cloud and set it as `GOOGLE_CALLBACK_URL` in the
`Prod` GitHub Actions environment. Keep the named tunnel token outside source
control. See [Cloudflare's Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/)
and Google's [OAuth web server requirements](https://developers.google.com/identity/protocols/oauth2/web-server).

The Python workers have no HTTP ports; they process messages from RabbitMQ.
Database, RabbitMQ, and object storage must be reachable using the values in
`.env`.

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
