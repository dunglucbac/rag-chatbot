# API Reference

Base URL: `http://localhost:3000`

---

## Ingestion

### Upload file

Queues an uploaded document for ingestion. The file is stored on disk and a background job is created to process it.

```
POST /ingest/file
Content-Type: multipart/form-data
```

**Form fields**

| Field | Type | Required | Description |
|---|---|---|---|
| file | file | yes | Uploaded file |

**Response 201**

```json
{
  "message": "File queued for ingestion",
  "job": {
    "id": "uuid",
    "status": "pending"
  }
}
```

**Notes**
- The file is written to `storage/uploads` under the project root
- Use `GET /ingest/jobs/:id` to inspect ingestion status

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

> Note: the application also exposes `/health` for basic health checks.

---

## Health

NestJS exposes no dedicated health endpoint by default. You can verify the app is running with:

```
GET /
```

Returns a plain text response from `AppController`.
