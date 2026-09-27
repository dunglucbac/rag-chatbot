# API Reference

Base URL: `http://localhost:3000`

---

## Authentication

The chat and ingestion APIs require a Google SSO access token. Start the OAuth flow
by opening `GET /auth/google`. Google redirects to `GET /auth/google/callback`, which
returns `{ accessToken, tokenType, expiresIn, user }` unless `AUTH_SUCCESS_REDIRECT_URL`
is configured. In that case, the browser is redirected there and the same token is in
the URL fragment.

Include the token on protected calls:

```
Authorization: Bearer <access-token>
```

`GET /auth/me` returns the authenticated Google user.

---

## Ingestion

### Upload file

Queues an uploaded document for ingestion. The API persists the original in
private S3-compatible object storage and creates a background job to process it.

```
POST /ingest/file
Content-Type: multipart/form-data
Authorization: Bearer <access-token>
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
- The API uses a temporary local file only while uploading; the durable source
  is stored under an opaque `storageKey` in object storage
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
