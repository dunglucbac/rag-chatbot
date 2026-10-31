# Personal spending UI

The English, mobile-first web app is served by NestJS at `/`. It uses the existing
Google OAuth, signed storage upload and ingestion pipeline. Production needs no
separate frontend service or build step. Assets live in `rag-chatbot-UI/public/`.
The UI is its own npm workspace; the backend lives in `rag-chatbot-BE/`.
Run shared install and migration commands from the repository root.
Use `npm run start:ui` for the standalone UI server at `http://localhost:4187`.
It proxies requests to `UI_API_ORIGIN` (default `http://127.0.0.1:3000`).
For Google login returning to this server, register and configure
`http://localhost:4187/auth/google/callback` as the callback URL.

Any verified Google account can sign in. Each user's chats, receipts, and uploads
are scoped to their Google identity. Register the existing `/auth/google/callback`
URL in Google. The UI starts `/auth/google?ui=1`
and returns to `/`; API OAuth clients retain `AUTH_SUCCESS_REDIRECT_URL` behavior.
Tokens are kept in session storage and removed from the callback fragment.

Run `npm run migration:run` before starting the changed server. New conversation
history is saved in `chat_messages`; deleting or expiring a session cascades to its
messages. Receipt records and ingestion jobs remain independent of chat retention.
Existing model checkpoints are retained, but older conversations have no UI
transcript until new messages are sent through the changed API.

## Additional API contracts

All routes use the existing Bearer guard and `{status, message, data}` envelope.
User IDs come from authentication. Resources belonging to someone else return 404.

- `POST /chat/sessions` → a new session, without invoking the model.
- `GET /chat/sessions?offset=0` → `{sessions, nextOffset}`, 30 newest first.
- `GET /chat/sessions/:id?before=<message-id>` → `{session, messages, nextBefore}`;
  the newest 100 entries are returned in ascending order. Use `nextBefore` to load
  earlier entries. Entries contain public user/assistant text or an upload job ID;
  model tool calls, system prompts and internal checkpoint state are excluded.
- `POST /chat/sessions/:id/uploads` with `{ingestionJobId}` → an upload entry.
  Session and upload ownership are both checked. Reattaching the same upload is
  idempotent. This also supports a deduplicated upload appearing in multiple chats.
- `GET /ingest/jobs?offset=0` → `{jobs, nextOffset}`, 30 newest first. This is also
  the recovery path for an upload accepted before its chat attachment could save.
- `GET /ingest/jobs/:id/payment-review` → `{job, review}`.
- `POST /ingest/jobs/:id/retry` → `{job}`; only failed uploads may be retried.
  Concurrent retries are rejected with 409. An unavailable queue leaves a failed
  job available for another explicit retry.
- `POST /ingest/jobs/:id/payment-review` accepts the existing deterministic payment
  review contract: `{action:'approve', itemName}` or `{action:'reject'}`.
- `GET /receipts?q=&from=YYYY-MM-DD&to=YYYY-MM-DD&offset=0&ingestionJobId=` →
  `{receipts, nextOffset}`, 30 newest purchases first. Search matches merchant or
  item names, case-insensitively. Date filters are inclusive local dates in
  `Asia/Ho_Chi_Minh`. Original files and raw OCR text are not included.
- `GET /receipts/:id` → a saved receipt including its line items and integer `revision`.
- `PATCH /receipts/:id` accepts `{revision, receipt}`. `receipt` follows the
  existing receipt review schema. An outdated `revision` returns 409; reload
  before editing again. Updates are transactional and trigger item categorization.
  The response is `{receipt, categorizationQueued}`; a false queue flag means the
  receipt was saved but category processing could not be queued.

Processing is polled while the app is open. Confident receipts save automatically;
uncertain receipts and bank transfers require explicit review. Batches use separate
upload targets, jobs and cards. Transfers require a purchase description. Receipt
reviews and saved receipt edits use fields-only forms. Chat replies arrive in full.
There are no offline uploads or background notifications in this first version.
The browser accepts receipt images and PDFs up to 25 MB per file. Storage bucket
CORS must allow the app origin and all returned upload headers. Live Google OAuth,
object storage and worker processing require the configured backend services.

## Verification

- `npm run build`
- `npm test -- --runInBand` — includes account restrictions, HTTP contracts,
  conversation and upload ownership, pagination, transactional receipt edits,
  stale edit conflicts, retry failures, and categorization overlapping an edit.
- `npm run test:ui` — file boundaries and Vietnam date/time round trips.

For local browser QA without cloud services, run these in separate terminals:

```sh
npm run simulate:ui
UI_API_ORIGIN=http://127.0.0.1:4010/spending npm run preview:ui
```

Open `http://127.0.0.1:4187` for this synthetic fixture run. Its sign-in uses a synthetic account in this
simulator only. Files whose names contain `fail-storage` exercise a storage 503.
POST `/_test/mode` with `{"mode":"conflict"}` or `{"mode":"chat-error"}`
to exercise the next receipt-save conflict or chat failure. These fixture routes
are not part of the NestJS app. The simulator models instant worker completion;
it does not establish real OCR quality or processing latency.

Chrome DevTools MCP checks on 2026-10-30 covered desktop and phone layouts,
restoring history in a second isolated browser context, receipt/payment approval,
saved-receipt correction, partial batch failure, and preserving inputs on chat
and save failures. The final mobile Lighthouse snapshot scored 100 for
accessibility and best practices; a clean reload produced no console errors.
Live Google OAuth, storage CORS, Python workers, and PostgreSQL migration execution
remain to be checked against your configured services.
