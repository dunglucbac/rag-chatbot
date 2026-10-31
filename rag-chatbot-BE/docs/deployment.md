# Deployment

## Local Development

Run deployment commands from the repository root. Compose builds the backend
from `rag-chatbot-BE/Dockerfile` with the entire repository as its build context,
including `rag-chatbot-UI/public/`. The Python build context is
`rag-chatbot-BE/python-worker/`.

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
connections, so use a Cloudflare Tunnel to reach the app. The startup script
runs a Quick Tunnel without a token, captures its current hostname, updates
`GOOGLE_CALLBACK_URL` in the Cloud PC's `.env`, and recreates the app container:

```powershell
.\scripts\start-cloudpc.ps1
```

Find the current callback URL in `logs/google-callback-url.txt`; the
Cloudflare output is in `logs/cloudflared-quick-tunnel.stdout.log` and
`logs/cloudflared-quick-tunnel.stderr.log`. Add that exact URL to the authorized
redirect URIs in the Google OAuth client. Google requires an exact callback
match and does not provide a supported API to add redirect URIs to a standard
web OAuth client, so this Google Cloud step must be repeated when the Quick
Tunnel URL changes. Set the same URL as `GOOGLE_CALLBACK_URL` in the `Prod`
GitHub Actions environment if you deploy again before restarting the tunnel.

For automatic startup, create a Windows Task Scheduler task for the same
account that runs Docker Desktop. Use an **At log on** trigger with this action:

```text
Program:   powershell.exe
Arguments: -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\rag-chatbot\scripts\start-cloudpc.ps1"
```

The script waits up to three minutes for Docker, starts the Compose services,
starts `cloudflared tunnel --url http://localhost:3000`, then recreates the app
using the current callback URL. It keeps the tunnel running in the foreground.
Quick Tunnels are for temporary testing. For a stable Google callback across
restarts, create a named Cloudflare Tunnel and configure its fixed hostname as
the callback instead. See [Cloudflare's tunnel setup](https://developers.cloudflare.com/tunnel/get-started/)
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
- [ ] Apply [`r2-cors.json`](../r2-cors.json) to the R2 bucket under
      **Settings → CORS Policy**. It allows the local UI ports and Cloudflare
      Quick Tunnel origins to `PUT` signed uploads with `Content-Type` and
      `x-amz-meta-original-filename`. Add any stable custom UI origin there.
      This file uses the dashboard JSON format; Wrangler expects a different
      format. See the [R2 CORS guide](https://developers.cloudflare.com/r2/buckets/cors/).
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
