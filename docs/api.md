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

### Create upload target

Creates a short-lived, direct upload URL. Uploading an object does not queue it
for ingestion.

```
POST /storage/upload-targets
Content-Type: application/json
Authorization: Bearer <access-token>
```

```json
{ "originalFilename": "statement.pdf", "mimeType": "application/pdf" }
```

The response contains a `storageKey` and a 15-minute `uploadUrl`. The client
uploads its bytes with an HTTP `PUT` to that URL and the same `Content-Type`.

### Queue object for ingestion

Queues a previously uploaded object. The key must belong to the authenticated
user (`raw/{userId}/…`), and the API checks that the object exists before
publishing worker work.

```
POST /ingest
Content-Type: application/json
Authorization: Bearer <access-token>
```

```json
{
  "storageKey": "raw/user-123/file-123.pdf",
  "originalFilename": "statement.pdf",
  "mimeType": "application/pdf",
  "checksumSha256": "optional 64-character SHA-256 hex"
}
```

Use `GET /ingest/jobs/:id` to inspect ingestion status.

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
