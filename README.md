# RAG Chatbot

A Retrieval-Augmented Generation (RAG) chatbot built with NestJS, LangChain, and PostgreSQL + pgvector. It exposes a Telegram bot interface and lets users chat with an AI agent that can search a knowledge base of uploaded PDFs and perform live web searches.

---

## Architecture

```
Telegram Bot
    ↓
Agent (LangGraph ReAct)
    ├── search_knowledge_base  →  PGVector (uploaded PDFs + scraped web content)
    └── search_web             →  Tavily API
         ↓
    LLM (Claude Sonnet 4.5 / GPT-4o)

Ingestion Pipeline:
    POST /ingest/file
    → save upload to local storage
    → create ingestion_jobs row in Postgres
    → push job to Redis Stream
    → Python worker extracts text/OCR
    → store chunks + metadata in PGVector

Background Scraper (every 6h):
    → Fetch unscraped Tavily URLs from web_search_logs
    → Cheerio content extraction (body text, capped at 8000 chars)
    → PGVector
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 (TypeScript) |
| LLM | Anthropic Claude Sonnet 4.5 or OpenAI GPT-4o |
| Embeddings | OpenAI text-embedding-3-small |
| Vector Store | PostgreSQL + pgvector |
| ORM | TypeORM |
| Agent | LangChain / LangGraph ReAct |
| Web Search | Tavily API |
| Chat Interface | Telegram (Telegraf) |
| Scraping | Cheerio + axios |
| Queue | Redis Stream |
| Parsing Worker | Python + Docling |

---

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Anthropic or OpenAI API key
- OpenAI API key (always required for embeddings)
- Tavily API key
- Public HTTPS URL for the Telegram webhook (ngrok or VS Code port forwarding)

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd rag-chatbot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in your values — see `.env.example` for all required keys.

### 3. Start the database stack

```bash
docker-compose up -d
```

### 4. Run database migrations

```bash
npm run migration:run
```

This will create the app schema using TypeORM migrations.

### 5. Run the app

Get a public HTTPS URL for the Telegram webhook using one of these options:

**Option A — ngrok:**
```bash
ngrok http 3000
```

**Option B — VS Code port forwarding:**
1. Open the **Ports** panel in VS Code
2. Forward port `3000`
3. Right-click → set visibility to **Public**
4. Copy the HTTPS URL

Set the URL in `.env`:
```env
TELEGRAM_WEBHOOK_URL=https://your-public-url
```

**Option C — cloudfare tunnel:**
```bash
cloudflared tunnel --url http://localhost:3000
```

Then start the app:

```bash
npm run start:dev   # development
npm run start:prod  # production
```

The server starts on `http://localhost:3000` and registers the Telegram webhook at `TELEGRAM_WEBHOOK_URL/telegram/webhook`.

---

## Database Migrations

The app uses TypeORM migrations instead of `synchronize`.

Available scripts:

```bash
npm run migration:generate
npm run migration:run
npm run migration:revert
```

### Notes

- `init.sql` is only used to enable the `vector` extension in Postgres.
- Database tables and column changes should be made through migrations.
- Ingestion job columns use snake_case in the database.

---

## API

### Upload a file

```
POST /ingest/file
Content-Type: multipart/form-data

file: <pdf or image file>
```

```json
{ "id": "job-id", "status": "pending" }
```

### Get ingestion job status

```
GET /ingest/jobs/:id
```

---

## How the Agent Works

1. User sends a message to the Telegram bot.
2. The ReAct agent decides which tools to call.
3. `search_knowledge_base` — vector similarity search over stored PDFs and scraped web pages. Always tried first.
4. `search_web` — queries Tavily for up-to-date information. Used only if the knowledge base has no relevant results. Result URLs are logged for later scraping.
5. The background scraper runs every 6 hours, extracts full page content from logged URLs, and adds it to the vector store.
6. The LLM synthesizes retrieved context into a final answer.

---

## Project Structure

```
src/
├── agent/              # LangGraph ReAct agent + tools
│   └── tools/
│       ├── knowledge-base.tool.ts
│       └── web-search.tool.ts
├── config/             # Environment configuration
├── conversation/       # Message entity
├── database/           # TypeORM / PostgreSQL setup + migrations
├── ingestion/          # Upload, job tracking, and queue handoff
├── llm/                # LLM provider abstraction (Claude / GPT-4o)
├── scraper/            # Background web scraper (cron, every 6h)
├── telegram/           # Telegram bot handler + webhook
├── vector-store/       # PGVector service
└── web-search/         # Tavily service + search log entity
```

---

## Development

```bash
npm run lint
npm run format
npm run test
npm run test:cov
```

---

## Docs

- [Architecture](docs/architecture.md) — module map, data flows, database schema, agent tools
- [API Reference](docs/api.md) — HTTP endpoints with request/response examples
- [Deployment](docs/deployment.md) — Docker, production checklist, caveats
- [Troubleshooting](docs/troubleshooting.md) — common issues and fixes
- [Contributing](docs/contributing.md) — setup, conventions, adding tools/providers

---

## License

MIT
