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

The Windows 365 Microsoft Hosted Network does not accept direct inbound
connections, so DuckDNS or an open Windows Firewall rule cannot make this host
publicly reachable. Use a named Cloudflare Tunnel, which connects outward from
the Cloud PC and keeps a stable public hostname across restarts.

In Cloudflare, create a named tunnel and add a published application route for
your Cloudflare-managed hostname. Set its service URL to
`http://localhost:3000`. Install `cloudflared` on the Cloud PC and set the
tunnel token as the Windows user environment variable `TUNNEL_TOKEN`. The
token is enough to run a remotely managed tunnel; no Cloudflare API token is
needed by the startup script. Keep the tunnel token out of source control.

Set the Google callback once to the stable hostname:

```text
https://<your-hostname>/auth/google/callback
```

Register that exact URL in Google Cloud and set the same value for
`GOOGLE_CALLBACK_URL` in the `Prod` GitHub Actions environment. Google requires
an exact match for OAuth redirect URIs, so the startup script does not change
the callback. See [Cloudflare's Tunnel setup](https://developers.cloudflare.com/tunnel/get-started/)
and Google's [OAuth web server requirements](https://developers.google.com/identity/protocols/oauth2/web-server).

Run the app and tunnel together from PowerShell:

```powershell
.\scripts\start-cloudpc.ps1
```

To start them at sign-in, create a Windows Task Scheduler task for the same
account that runs Docker Desktop. Use an **At log on** trigger and this action:

```text
Program:   powershell.exe
Arguments: -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\rag-chatbot\scripts\start-cloudpc.ps1"
```

The script waits up to three minutes for Docker, starts the Compose services,
then runs `cloudflared tunnel run` in the foreground. Set `TUNNEL_TOKEN` in the
Windows user environment before launching it.

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
