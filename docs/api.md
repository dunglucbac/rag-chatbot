# API Reference

Base URL: `http://localhost:3000`

---

## Ingestion

### Upload PDF

Ingests a PDF into the vector knowledge base. The file is split into 1000-character chunks with 200-character overlap, embedded, and stored in PostgreSQL.

```
POST /ingest/pdf
Content-Type: multipart/form-data
```

**Form fields**

| Field | Type | Required | Description |
|---|---|---|---|
| file | file | yes | PDF file (application/pdf only) |

**Response 201**

```json
{
  "message": "PDF ingested",
  "chunks": 42
}
```

**Notes**
- Non-PDF files are silently rejected by the file filter (no error is returned — the upload will succeed but nothing is stored)
- The temp file at `/tmp` is deleted after ingestion

---

## Telegram Webhook

### Receive update

Called by Telegram's servers when a user sends a message to the bot. You should not call this manually — it is registered automatically on startup via `TELEGRAM_WEBHOOK_URL`.

```
POST /telegram/webhook
Content-Type: application/json
```

**Body** — standard [Telegram Update object](https://core.telegram.org/bots/api#update)

**Response** — delegated to Telegraf

---

## Health

NestJS exposes no dedicated health endpoint by default. You can verify the app is running with:

```
GET /
```

Returns a plain text response from `AppController`.
