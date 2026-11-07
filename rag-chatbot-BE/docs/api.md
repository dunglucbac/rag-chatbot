# API Reference

See [the personal spending UI contracts](../../rag-chatbot-UI/README.md#additional-api-contracts) for
conversation history, upload history, payment review and saved receipt editing.

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

## Investment journal

These endpoints use the same Bearer session as chat. Investment data is scoped
to the authenticated user and does not affect receipt spending summaries.
Apply the TypeORM migrations before using them.

- `GET /investments/stocks` lists the user's tracked symbols.
- `GET /investments/stocks/:symbol` returns the symbol and its dated events.
- `POST /investments/stocks/:symbol/events` records an event, creating the
  tracked symbol if needed.

Example recorded purchase (VND amounts are decimal strings):

```json
{
  "requestId": "4e15685b-de2e-41e5-ab98-6091c8512a40",
  "type": "buy",
  "occurredOn": "2026-11-06",
  "shares": 500,
  "priceVnd": "54000",
  "feesVnd": "10000",
  "note": "Reported purchase"
}
```

`requestId` is a client-generated UUID that must be unique per user. Retrying
the same event with the same ID returns `deduplicated: true`; reusing that ID
for different data or another symbol returns 409. The server never places a
brokerage order.

All events require `requestId`, `type`, and a calendar date `occurredOn` in
`YYYY-MM-DD` format; `note` is optional. Supported event-specific fields are:

- `interest`: `level` is `low`, `medium`, or `high`.
- `decision`: `decision` is `buy`, `hold`, `reduce`, `avoid`, or `wait`.
- `buy` / `sell`: positive integer `shares`, positive decimal-string
  `priceVnd`, and optional nonnegative decimal-string `feesVnd`.
- `position`: nonnegative integer `shares` and optional positive decimal-string
  `averageCostVnd`, for a reported position without inventing earlier trades.

To correct an entry, send a new event of the same type and symbol with a new
`requestId` and `supersedesId` set to the original event ID. The original stays
in history, and calculations use its replacement. Only the owning user can
correct an event, and competing corrections return 409.

Stock list and detail responses include the current interest, latest decision,
and derived position as of the current Vietnam date. Position amounts are decimal
strings. Average acquisition cost uses reported buy prices and buy fees; a sell
reduces the remaining cost proportionally. A position snapshot replaces prior
holdings and cost. Unknown opening cost stays unknown, and an unmatched sale
makes holdings unknown until a later snapshot reconciles it. Warnings identify
missing purchase fees, ambiguous same-day ordering, invalid or future events,
and unknown cost basis.

The Investments UI can record and correct these entries. It does not yet delete
previous entries, update the journal through chat, or run stock research. Trade
records are user reports, not broker-verified transactions.

### Market data

Set `FINHAY_API_KEY` on the backend to an API key created in the Finhay API
management portal. The key is sent only to Finhay as `X-FH-APIKEY`; users do
not need to connect individual Finhay accounts. The market-data strategy is
bound in `InvestmentModule`, so another provider can implement
`MarketDataProvider`. See [Finhay's quickstart](https://developers.fhsc.com.vn/quickstart).

- `GET /investments/market-data/status` reports whether a key is configured; it does
  not verify the key with Finhay.
- `GET /investments/market-data/quote/:symbol` returns a validated market quote.
- `GET /investments/market-data/valuation/:symbol` combines that quote with the
  authenticated user's recorded position. An unknown timestamp is marked stale.
- `GET /investments/market-data/research-snapshot/:symbol` returns bounded market
  evidence and lists unavailable components. Financial statement arrays are
  wrapped in `items` for the research worker.

The old `/investments/finhay/*` read paths remain aliases. A `429` pauses
further provider requests until Finhay’s reset time. These endpoints remain
authenticated. Previous OAuth credentials in the
`finhay_connections` table are not used or deleted by this change. Live API
keys and provider contracts must be verified in the deployment environment.

`GET /investments/budget` returns the current Vietnam calendar month, the US$10
limit, spent, reserved, and remaining amounts as integer USD micro-units. The
document embedding path reserves a conservative estimate before calling OpenAI
and reconciles reported token usage afterward. When the billing outcome is
unknown, its reservation remains pending. The provider rate must be configured
explicitly; usage-based accounting may differ from the provider invoice.

### Company-report PDFs

Upload a PDF through the normal ingestion flow and wait for the job to complete.
In the Investments view, select its stock and attach the completed PDF with its
title and publication date. The application verifies upload ownership, extracts
page text, and stores embeddings tagged with owner, stock, document ID, and page.
The publication date is supplied by the user and is not independently verified.

Configure `INVESTMENT_EMBEDDING_RATE_MICROS_PER_MILLION` to the verified current
USD micro-unit input price per million tokens for `text-embedding-3-small` and
configure `OPENAI_API_KEY`. Text from the selected PDF is sent to OpenAI to
generate embeddings. Indexing and search reserve investment AI budget before
requesting embeddings. Up to 300 PDF pages and 150,000 extracted characters are
accepted, subject to the embedding request's token limit. Image-only scanned
PDFs need page-level OCR and are currently rejected.

- `GET /investments/stocks/:symbol/documents` lists owned reports.
- `POST /investments/stocks/:symbol/documents` accepts `{ingestionJobId, title,
  publicationDate, retryFailed?}`. A failed retry may incur another charge.
- `POST /investments/stocks/:symbol/documents/search` accepts `{query, asOf?}`
  and returns passages with report, publication date, and page references.
- `GET /investments/stocks/:symbol/documents/:id/source` creates a five-minute
  link to the owned source PDF.

---

## Ingestion

Files use a three-request, direct-to-object-storage flow. The API never proxies
the file bytes:

```text
1. POST /storage/upload-targets  → obtain a 15-minute signed upload URL and storage key
2. PUT  <uploadUrl>              → upload the file bytes directly to R2/S3
3. POST /ingest                  → validate the uploaded object and queue processing
```

Keep the `storageKey` from step 1 until step 3. Use
the upload target's `mimeType` for the step 2 `Content-Type` header; ingestion
reads that type from the stored object. Uploading the object alone does **not**
start processing.

### 1. Create an upload target

Creates a short-lived, direct upload URL that includes the original filename
as signed object metadata. The filename is URI-encoded under
`original-filename` to preserve Unicode and special characters, and decoded
when the API reads it. Send the returned `uploadHeaders` with the PUT request
exactly as provided. The content type and filename header are signed; changing
or omitting them causes the upload to fail signature validation. Uploading an
object does not queue it for ingestion.

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
    "uploadHeaders": {
      "Content-Type": "application/pdf",
      "x-amz-meta-original-filename": "statement.pdf"
    },
    "expiresInSeconds": 900
  }
}
```

`uploadUrl` is a short-lived bearer credential. Do not store it in a database,
commit it, or expose it in logs. Request a new target if it expires.

### 2. Upload the bytes to the signed URL

Send an HTTP `PUT` directly to `data.uploadUrl`. Do not add the API bearer
token to this request. The URL itself authorizes a specific object operation.

Send both headers from `data.uploadHeaders`: `Content-Type` and
`x-amz-meta-original-filename`. Their values must exactly match the response
because they are part of the signed request. Copy the encoded filename value
without decoding it. R2 maps `x-amz-meta-*` headers to custom object metadata
([R2 metadata documentation](https://developers.cloudflare.com/r2/api/s3/extensions/)).

```bash
curl --request PUT "$UPLOAD_URL" \
  --header 'Content-Type: application/pdf' \
  --header 'x-amz-meta-original-filename: statement.pdf' \
  --upload-file './statement.pdf'
```

For a HEIC image, use `image/heic` in both places:

```text
POST /storage/upload-targets body: { "originalFilename": "IMG_0961.HEIC", "mimeType": "image/heic" }
PUT header:                       Content-Type: image/heic
PUT header:                       x-amz-meta-original-filename: IMG_0961.HEIC
```

### 3. Queue the uploaded object for ingestion

Queues a previously uploaded object. The key must belong to the authenticated
user (`raw/{userId}/…`), and the API checks that the object exists before
publishing worker work.

The API reads the original filename and MIME type from object-storage metadata
and uses them for the job and worker event. Do not send `originalFilename` or
`mimeType` in this request. Older objects without filename metadata must be
uploaded again using a fresh upload target. Objects without a content type or
with a multipart content type are rejected; upload raw file bytes with the
correct `Content-Type` header.

```
POST /ingest
Content-Type: application/json
Authorization: Bearer <access-token>
```

```json
{
  "storageKey": "raw/user-123/file-123.pdf",
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
    headers: target.uploadHeaders,
    body: file,
  });
  if (!uploadResponse.ok) throw new Error('File upload failed');

  const ingestionResponse = await fetch('/ingest', {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({
      storageKey: target.storageKey,
    }),
  });
  if (!ingestionResponse.ok) throw new Error('Could not queue ingestion');

  return (await ingestionResponse.json()).data.job;
}
```

Some browsers report an empty `File.type` for HEIC files. In that case, pass
`'image/heic'` explicitly as `mimeType`.

### Postman setup

Set the `originalFilename` and `mimeType` collection variables to match the file
you will select in **R2 Upload**. For example, use `IMG_0961.HEIC` and
`image/heic` for that specific file. The pre-request script validates the
variables without overwriting them:

```javascript
for (const name of ['originalFilename', 'mimeType']) {
  const value = pm.variables.get(name);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(
      'Set the ' + name + ' variable to match the file selected in R2 Upload.',
    );
  }
}
```

Use this request body:

```json
{
  "originalFilename": "{{originalFilename}}",
  "mimeType": "{{mimeType}}"
}
```

The original filename comes from this upload-target request. Selecting a file
in the binary PUT does not update its name in metadata: the PUT body contains
only file bytes, and its metadata header is already signed. To correct a name,
set the variable, request a fresh upload target, upload the file, and ingest
the new `storageKey`.

In its **Tests** script, save the API response values:

```javascript
const response = pm.response.json();

pm.test('Upload target was created', () => {
  pm.expect(response.status).to.eql('success');
  pm.expect(response.data.uploadUrl).to.be.a('string');
});

pm.collectionVariables.set('uploadUrl', response.data.uploadUrl);
pm.collectionVariables.set('storageKey', response.data.storageKey);
pm.collectionVariables.set(
  'uploadContentType',
  response.data.uploadHeaders['Content-Type'],
);
pm.collectionVariables.set(
  'uploadOriginalFilename',
  response.data.uploadHeaders['x-amz-meta-original-filename'],
);
```

For the second request, choose `PUT`, set the URL to `{{uploadUrl}}`, set
`Content-Type` to `{{uploadContentType}}` and `x-amz-meta-original-filename` to
`{{uploadOriginalFilename}}`, and choose the file under **Body → binary**.
The repository's `rag-chatbot.postman_collection.json` configures this request
as **R2 Upload**. After importing it, select your local file in the binary body;
the file selection is not bundled with the collection.

Do not use **Body → form-data**. Object storage saves that entire multipart
request body, including the wrapper, and records its multipart content type.
If an object was uploaded this way, create a fresh upload target and upload the
file again as binary with the correct `Content-Type`, then use the new
`storageKey` for ingestion.

For the final `POST /ingest` request, use:

```json
{
  "storageKey": "{{storageKey}}"
}
```

### Client requirements

- For Cloudflare R2, apply [`r2-cors.json`](../r2-cors.json) in the bucket's
  **Settings → CORS Policy**. It permits the UI origins and the two signed
  upload headers: `Content-Type` and `x-amz-meta-original-filename`.
- Use a new signed URL when a request has expired (the default is 900 seconds).
- For large files, the current API uses a single signed `PUT`; multipart upload
  support is a future enhancement.

---

## Receipt reviews

Receipt results with parser confidence below `0.9` are retained for the
authenticated owner to confirm or correct instead of being persisted immediately.
The worker uses OCR-derived text only and does not fall back to a vision model.
Fetch the proposed receipt with:

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
the proposed receipt fields and ask the user to confirm or correct uncertain
details through the receipt review UI. It cannot select another job from the
model's output.

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
