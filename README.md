# RAG Chatbot

One Git repository with two application workspaces:

- [rag-chatbot-BE](rag-chatbot-BE/README.md): NestJS API, database migrations,
  receipt processing, and the Python worker.
- [rag-chatbot-UI](rag-chatbot-UI/README.md): mobile-first spending UI, its local
  server, UI checks, and API simulation fixtures.

Shared `.env`, `package-lock.json`, Docker Compose, and deployment automation
remain at the repository root. Install dependencies once from here:

```sh
npm ci
```

On a new checkout, copy `.env.example` to `.env`. The existing `.env` stays in
place when reorganizing an existing checkout.

Configure the backend services and Google OAuth credentials, then run:

```sh
npm run migration:run
npm run start:dev
```

The backend serves the UI at `http://localhost:3000`. Its production Docker image
includes the UI assets, so the existing single-URL deployment is preserved.

For the standalone UI development server, keep the backend running and use:

```sh
npm run start:ui
```

Open `http://localhost:4187`; API requests are proxied to the backend. Set
`UI_API_ORIGIN` to use another backend. For Google sign-in returning to this
development server, set `GOOGLE_CALLBACK_URL` to
`http://localhost:4187/auth/google/callback` and register that exact URI in Google.

Existing root commands forward to the backend workspace. Each app can also be
run directly with npm's workspace option:

```sh
npm run build
npm test -- --runInBand
npm run test:ui
npm run start:dev --workspace=rag-chatbot-be
npm run start --workspace=rag-chatbot-ui
docker compose up -d --build
```

Backend architecture and deployment guides live in
[rag-chatbot-BE/docs](rag-chatbot-BE/docs/architecture.md). The frontend guide
includes instructions for running against synthetic API fixtures without cloud
services. No application logic, stored receipts, or Git history is removed by
the workspace split.
