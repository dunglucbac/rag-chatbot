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

Files use a three-request, direct-to-object-storage flow. The API never proxies
the file bytes:

```text
1. POST /storage/upload-targets  → obtain a 15-minute signed upload URL and storage key
2. PUT  <uploadUrl>              → upload the file bytes directly to R2/S3
3. POST /ingest                  → validate the uploaded object and queue processing
```

Keep the `storageKey`, `originalFilename`, and `mimeType` from step 1 until
step 3. Uploading the object alone does **not** start processing.

### 1. Create an upload target

Creates a short-lived, direct upload URL. Uploading an object does not queue it
for ingestion.

```
POST /storage/upload-targets
Content-Type: application/json
Authorization: Bearer <access-token>
```

```json
{
  "originalFilename": "statement.pdf",
  "mimeType": "application/pdf"
}
```

Example response:

```json
{
  "status": "success",
  "message": "Upload target created",
  "data": {
    "storageKey": "raw/google-user-id/4a3c8d8a-7b20-4d3a-8cc0-91a7c5c70c5a.pdf",
    "uploadUrl": "https://<object-storage-endpoint>/...?X-Amz-Signature=...",
    "expiresInSeconds": 900
  }
}
```

`uploadUrl` is a short-lived bearer credential. Do not store it in a database,
commit it, or expose it in logs. Request a new target if it expires.

### 2. Upload the bytes to the signed URL

Send an HTTP `PUT` directly to `data.uploadUrl`. Do not add the API bearer
token to this request. The URL itself authorizes a specific object operation.

The `Content-Type` header **must exactly match** the `mimeType` provided in
step 1 because it is part of the signed request.

```bash
curl --request PUT "$UPLOAD_URL" \
  --header 'Content-Type: application/pdf' \
  --upload-file './statement.pdf'
```

For a HEIC image, use `image/heic` in both places:

```text
POST /storage/upload-targets body: { "originalFilename": "IMG_0961.HEIC", "mimeType": "image/heic" }
PUT header:                       Content-Type: image/heic
```

### 3. Queue the uploaded object for ingestion

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

The response contains `data.job.id`. Use that ID to inspect processing status:

```text
GET /ingest/jobs/:id
Authorization: Bearer <access-token>
```

### Browser client example

```ts
async function uploadAndQueueFile(
  file: File,
  accessToken: string,
  mimeType = file.type,
) {
  const apiHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const targetResponse = await fetch('/storage/upload-targets', {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({ originalFilename: file.name, mimeType }),
  });
  if (!targetResponse.ok) throw new Error('Could not create upload target');

  const target = (await targetResponse.json()).data;
  const uploadResponse = await fetch(target.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: file,
  });
  if (!uploadResponse.ok) throw new Error('File upload failed');

  const ingestionResponse = await fetch('/ingest', {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({
      storageKey: target.storageKey,
      originalFilename: file.name,
      mimeType,
    }),
  });
  if (!ingestionResponse.ok) throw new Error('Could not queue ingestion');

  return (await ingestionResponse.json()).data.job;
}
```

Some browsers report an empty `File.type` for HEIC files. In that case, pass
`'image/heic'` explicitly as `mimeType`.

### Postman setup

Use collection variables for the values that cross the three requests. In the
**Pre-request Script** of `POST /storage/upload-targets`:

```javascript
pm.collectionVariables.set('originalFilename', 'IMG_0961.HEIC');
pm.collectionVariables.set('mimeType', 'image/heic');
```

Use this request body:

```json
{
  "originalFilename": "{{originalFilename}}",
  "mimeType": "{{mimeType}}"
}
```

In its **Tests** script, save the API response values:

```javascript
const response = pm.response.json();

pm.test('Upload target was created', () => {
  pm.expect(response.status).to.eql('success');
  pm.expect(response.data.uploadUrl).to.be.a('string');
});

pm.collectionVariables.set('uploadUrl', response.data.uploadUrl);
pm.collectionVariables.set('storageKey', response.data.storageKey);
```

For the second request, choose `PUT`, set the URL to `{{uploadUrl}}`, set
`Content-Type` to `{{mimeType}}`, and choose the file under **Body → binary**.
For the final `POST /ingest` request, use:

```json
{
  "storageKey": "{{storageKey}}",
  "originalFilename": "{{originalFilename}}",
  "mimeType": "{{mimeType}}"
}
```

### Client requirements

- Configure object-storage CORS to permit your browser origin to send `PUT`
  requests with the `Content-Type` header.
- Use a new signed URL when a request has expired (the default is 900 seconds).
- For large files, the current API uses a single signed `PUT`; multipart upload
  support is a future enhancement.

---

## Receipt reviews

Low-confidence receipt results are retained for the authenticated owner instead
of being persisted immediately. Fetch the proposed receipt with:

```text
GET /ingest/jobs/:id/review
Authorization: Bearer <access-token>
```

Approve the proposed receipt, optionally replacing it with a complete corrected
receipt object that follows the returned `review.receipt` shape:

```text
POST /ingest/jobs/:id/review
Authorization: Bearer <access-token>
Content-Type: application/json

{ "action": "approve" }
```

Approval queues `receipt.parsed` and sets the job to `processing`; the existing
receipt consumer persists it and marks the job complete. To discard the proposed
receipt instead, submit `{ "action": "reject" }`. Rejected jobs are terminal.

Only the user who owns the ingestion job may fetch or resolve its review. A
review can be resolved once; a second request returns `409 Conflict`.

### Reviewing through chat

The chat endpoints can present and resolve a review after the UI supplies the
ingestion job ID returned by `POST /ingest`:

```text
POST /chat/messages
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "message": "Please show me the extracted receipt data for this upload.",
  "ingestionJobId": "<job UUID>"
}
```

The LangGraph agent is given a read tool bound to that job and the authenticated
user. It can report the processing status and, for a pending receipt review,
the proposed receipt fields. It cannot select another job from the model's
output.

After showing the data, the UI must collect an explicit approval or rejection.
Send it separately from free-form text:

```json
{
  "message": "I approve the proposed receipt data.",
  "ingestionJobId": "<job UUID>",
  "reviewAction": "approve"
}
```

`reviewAction` accepts `approve` or `reject`. The agent receives a write tool
only when this explicit UI value is present, and that tool is permanently bound
to the authenticated user, selected job, and supplied action. Correcting
receipt fields through chat is intentionally not supported; use the existing
review endpoint for a corrected receipt object.

### Bank-transfer reviews

When the worker detects a bank-transfer confirmation, it extracts the
recipient, timestamp, amount, currency, and confidence from the uploaded image
and puts the job in `needs_review`. Chat shows those document-derived facts and
asks the user what the transfer paid for. A transfer does not have receipt line
items until the user supplies one.

To confirm the transfer, send the user-provided item name with the explicit UI
action:

```json
{
  "message": "This transfer paid my electricity bill. Save it.",
  "ingestionJobId": "<job UUID>",
  "reviewAction": "approve",
  "paymentItemName": "Electricity bill"
}
```

The server publishes a normal `receipt.parsed` event using the detected amount
and currency. It creates one receipt with one item named `paymentItemName`, so
the existing categorization and spending-analysis flow applies. The user cannot
provide the amount through chat; it comes from the transfer document.

---

## Health

NestJS exposes no dedicated health endpoint by default. You can verify the app is running with:

```
GET /
```

Returns a plain text response from `AppController`.
