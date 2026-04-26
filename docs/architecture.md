# Architecture

## Overview

The application is a NestJS monolith composed of loosely coupled modules. All AI logic runs through LangChain/LangGraph; PostgreSQL with pgvector handles both relational data and vector embeddings.

---

## Module Map

```
AppModule
├── ConfigModule          — environment variables
├── DatabaseModule        — TypeORM + PostgreSQL
├── LlmModule             — Claude / GPT-4o abstraction
├── VectorStoreModule     — PGVector read/write
├── WebSearchModule       — Tavily API + search log
├── IngestionModule       — PDF → chunks → embeddings
├── AgentModule           — LangGraph ReAct agent
├── TelegramModule        — Telegraf bot + webhook
└── ScraperModule         — background cron scraper
```

---

## Data Flows

### 1. Chat (Telegram → Agent → LLM)

```
User message (Telegram)
  → POST /telegram/webhook
  → TelegramUpdate (bot.on('text'))
  → AgentService.invoke(userId, message)
      → createReactAgent per-invocation
            llm: LlmService.getModel()
            tools: [search_knowledge_base, search_web(userId)]
            (web search tool is created per-invoke to capture userId)
      → LangGraph ReAct decides which tools to call
          ├── search_knowledge_base({ query })
          │     → VectorStoreService.similaritySearch(query, k=4)
          │     → returns top-4 chunks formatted as "Source: <url>\n<text>"
          │     → "No relevant information found." if empty
          └── search_web({ query })
                → WebSearchService.search(query, userId)
                → POST https://api.tavily.com/search (max_results: 3)
                → saves each result URL to web_search_logs (scraped: false)
                → returns formatted results prefixed with ⚠️ web search notice
      → LLM synthesizes context into final answer
  → ctx.reply(answer)
```

### 2. File ingestion

```
POST /ingest/file (multipart/form-data, field: "file")
  → FileInterceptor (multer diskStorage → storage/uploads/<timestamp>-<name>)
  → IngestionService.createJobFromUpload(file)
      → create `ingestion_jobs` row with status=pending
      → persist metadata about the original filename, storage path, MIME type, and source type
      → queue background processing
  → { message: "File queued for ingestion", job: { id, status } }
```

### 3. Background Web Scraper (every 6 hours)

```
Cron: 0 */6 * * *  (ScraperService.scrapeAndEmbed)
  → WebSearchService.getUnscraped()
        → SELECT * FROM web_search_logs WHERE scraped = false
  → for each log:
      → axios.get(log.url, timeout: 10s)
      → cheerio: remove script/style/nav/footer, extract body text
      → normalize whitespace
      → if content.length > 100:
            → VectorStoreService.addDocuments([Document])
                  pageContent: content.slice(0, 8000)
                  metadata: { source: log.url, type: 'web' }
      → WebSearchService.markScraped(log.id)
            → UPDATE web_search_logs SET scraped = true WHERE id = ?
      → failed URLs are warned and skipped (no retry)
```

---

## Database Schema

### `document_embeddings` (managed by PGVector)

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| content | text | Chunk text |
| metadata | jsonb | Source path/URL, type (pdf/web), page number |
| embedding | vector(1536) | OpenAI text-embedding-3-small |

### `messages` (TypeORM entity)

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| userId | varchar | Telegram user ID |
| threadId | varchar | Conversation thread |
| role | enum | `human` or `ai` |
| content | text | Message text |
| createdAt | timestamp | Auto-generated |

### `web_search_logs` (TypeORM entity)

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| userId | varchar | Telegram user ID who triggered the search |
| query | text | Search query string |
| url | text | Tavily result URL |
| scraped | boolean | Whether content has been added to vector store |
| timestamp | timestamp | Auto-generated |

---

## LLM Provider Abstraction

`LlmService.getModel()` reads `LLM_PROVIDER` and returns a LangChain `BaseChatModel`.

Embeddings always use OpenAI `text-embedding-3-small` regardless of the LLM provider, so `OPENAI_API_KEY` is always required.

## Database Migrations

TypeORM migrations are managed from `src/database/data-source.ts`, which points to `src/database/migrations/*.ts`.

Recommended commands:

```bash
npm run migration:generate -- --name MigrationName
npm run migration:run
npm run migration:revert
```

---

## Agent Tool Definitions

### `search_knowledge_base`

- Description: "Search uploaded PDF documents for relevant information. Use this first before searching the web."
- Input schema: `{ query: string }`
- Returns: top-4 similar chunks joined as `Source: <url>\n<text>`, or a "not found" message
- Source: [src/agent/tools/knowledge-base.tool.ts](../src/agent/tools/knowledge-base.tool.ts)

### `search_web`

- Description: "Search the internet for up-to-date information. Only use this if the knowledge base has no relevant results."
- Input schema: `{ query: string }`
- Returns: Tavily results formatted as numbered list with URL + snippet, prefixed with a web-search notice
- Side effect: logs each result URL to `web_search_logs` for later scraping
- Created per-invocation to capture the calling `userId`
- Source: [src/agent/tools/web-search.tool.ts](../src/agent/tools/web-search.tool.ts)

---

## Key Design Decisions

- **Agent per invocation** — `AgentService.invoke` creates a fresh `createReactAgent` on every call rather than reusing one. This is intentional: the web search tool must close over the current `userId` to correctly attribute search logs.
- **Scraper enriches the knowledge base over time** — web search results are immediately returned to the user as raw Tavily snippets, but the full page content is scraped asynchronously and added to the vector store, improving future knowledge base hits for similar queries.
- **No conversation memory in the agent** — messages are stored in the `messages` table but the agent currently does not load prior messages as context. Each invocation is stateless from the LLM's perspective.
