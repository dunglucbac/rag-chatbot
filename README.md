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
    POST /ingest/pdf
    → PDFLoader + RecursiveCharacterTextSplitter (1000 chars, 200 overlap)
    → OpenAI text-embedding-3-small
    → PGVector (document_embeddings table)

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

---

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Telegram bot token (from [@BotFather](https://t.me/BotFather))
- Anthropic or OpenAI API key
- OpenAI API key (always required for embeddings)
- Tavily API key
- Public HTTPS URL for the Telegram webhook (e.g. ngrok)

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

### 3. Start the database

```bash
docker-compose up -d
```

### 4. Run the app

```bash
npm run start:dev   # development
npm run start:prod  # production
```

The server starts on `http://localhost:3000` and registers the Telegram webhook automatically.

---

## API

### Upload a PDF

```
POST /ingest/pdf
Content-Type: multipart/form-data

file: <pdf file>
```

```json
{ "message": "PDF ingested", "chunks": 42 }
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
├── database/           # TypeORM / PostgreSQL setup
├── ingestion/          # PDF upload and chunking pipeline
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
