# Troubleshooting

## Telegram

### Bot not receiving messages

1. Confirm the webhook is registered:
   ```bash
   curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
   ```
   Check that `url` matches your `TELEGRAM_WEBHOOK_URL/telegram/webhook` and `last_error_message` is empty.

2. Ensure your server is reachable from the internet over HTTPS. Telegram rejects HTTP and self-signed certificates.

3. If running locally, confirm ngrok is still running — ngrok URLs expire when the process stops.

### Webhook registration fails on startup

- Check `TELEGRAM_BOT_TOKEN` is correct.
- Check `TELEGRAM_WEBHOOK_URL` does not have a trailing slash.

---

## Database

### `relation "document_embeddings" does not exist`

The PGVector table is created lazily by `VectorStoreService.onModuleInit`. If the app crashes before that runs, the table may not exist. Restart the app — it will recreate it.

### `extension "vector" does not exist`

The pgvector extension was not installed. This is handled by `init.sql` on first container start. If you connected an existing PostgreSQL instance, run manually:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### TypeORM sync drops columns unexpectedly

`synchronize: true` will alter the schema to match entities on every startup. Switch to TypeORM migrations for production:

```bash
npm run typeorm migration:generate -- -n MigrationName
npm run typeorm migration:run
```

---

## Ingestion

### PDF upload returns 200 but `chunks: 0`

- The file was not a valid PDF (`application/pdf` MIME type required). The file filter silently rejects other types.
- The PDF may have no extractable text (e.g. scanned image-only PDF). Use an OCR pre-processing step before uploading.

### Embeddings fail with 401

`OPENAI_API_KEY` is missing or invalid. This key is always required for embeddings even when `LLM_PROVIDER=anthropic`.

---

## Agent / LLM

### Agent returns no results from knowledge base

- Confirm the PDF was ingested successfully (`chunks > 0` in the response).
- The query may not be semantically similar to the stored content. Try rephrasing.
- Check the `document_embeddings` table has rows:
  ```sql
  SELECT COUNT(*) FROM document_embeddings;
  ```

### Web search tool not triggering

The agent's tool description instructs it to use `search_knowledge_base` first. If the knowledge base returns results (even loosely relevant ones), the agent may not fall back to web search. This is by design.

### LLM errors with 529 / rate limit

Anthropic and OpenAI both enforce rate limits. Add retry logic in `LlmService` or reduce concurrent requests.

---

## Scraper

### URLs stuck as `scraped: false`

- The scraper runs every 6 hours. Check logs for `Failed to scrape` warnings.
- The target site may block automated requests (403/429). The scraper skips failed URLs with no retry.
- Trigger a manual scrape by calling `ScraperService.scrapeAndEmbed()` directly in a NestJS REPL:
  ```bash
  npm run start -- --entryFile repl
  ```
  ```ts
  await get(ScraperService).scrapeAndEmbed()
  ```
