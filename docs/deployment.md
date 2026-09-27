# Deployment

## Local Development

### 1. Start the database

```bash
docker-compose up -d
```

### 2. Expose a public webhook URL

Telegram requires a public HTTPS URL to deliver updates. Use ngrok:

```bash
ngrok http 3000
```

Copy the `https://` URL and set it as `TELEGRAM_WEBHOOK_URL` in `.env`.

### 3. Run the app

```bash
npm run start:dev
```

On startup, `TelegramService.onModuleInit` calls `bot.telegram.setWebhook(`${TELEGRAM_WEBHOOK_URL}/telegram/webhook`)` automatically.

---

## Production (Docker)

### Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/main"]
```

### docker-compose (production)

```yaml
services:
  app:
    build: .
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASS}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

---

## Environment Checklist

Before deploying, confirm:

- [ ] `TELEGRAM_WEBHOOK_URL` is a valid public HTTPS URL pointing to your server
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
