# PRD: REST Chat API Endpoint

## Problem Statement

The only way to interact with the LangGraph ReAct agent today is through the Telegram bot webhook. There is no REST API for chat. The ingestion pipeline (file upload → parse/classify → embed) has a clean REST interface, but chat is locked inside the Telegram update handler. Teams building web or mobile clients, or wanting to decouple the chat interface from Telegram, have no API to call.

## Solution

A new REST chat endpoint under `/api/v1/chat` that accepts text messages, runs the LangGraph agent, and returns the reply. Sessions are created implicitly on the first message and continued via a `sessionId`. The endpoint follows the same `ApiResponse` envelope convention as the ingestion API, with an interceptor for successes and an exception filter for errors.

Users upload files through the existing `POST /ingest/file` endpoint. Once ingested and embedded into the vector store, the chat agent can retrieve that content through its knowledge base tool. Upload and chat are fully decoupled.

## User Stories

1. As an API consumer, I want to send a chat message via REST, so that I can build web or mobile chat interfaces that use the same agent as the Telegram bot.
2. As an API consumer, I want the first message to auto-create a session, so that I don't need a separate session-creation step.
3. As an API consumer, I want to continue a conversation by referencing a session ID, so that the agent maintains context across multiple messages.
4. As an API consumer, I want responses wrapped in a consistent `ApiResponse` envelope, so that my client can parse successes and errors uniformly.
5. As an API consumer, I want validation errors (like empty messages) to return a standardized error shape, so that I can handle errors predictably.
6. As an API consumer, I want to pass an optional user identifier via headers, so that chat sessions can be associated with a user without requiring full authentication.
7. As a developer, I want the chat endpoint to support streaming in the future, so that users get a better UX as the agent runs its tool loop.
8. As a Telegram user, I want the chat endpoint to eventually replace the inline agent call in the webhook, so that all chat goes through a single code path.

## Implementation Decisions

### Module structure

A new `ChatModule` will wrap `AgentModule` and expose a REST controller. The `AgentModule` remains thin — it provides `AgentService` and tools. `ChatModule` adds session management, HTTP concerns, and response formatting.

- `ChatModule` imports `AgentModule`
- `ChatController` handles HTTP routing and validation
- `ChatService` orchestrates sessions and delegates to `AgentService`

### Session lifecycle

Sessions are created implicitly. The first call to `POST /chat/messages` (without a `sessionId`) creates a new session and returns its ID. Subsequent calls to `POST /chat/sessions/:sessionId/messages` continue that session.

LangGraph's built-in checkpointing will persist conversation state. The initial implementation uses an in-memory `MemorySaver`; a Postgres-backed checkpointer replaces it later without changing the public interface.

### API contract

```
POST /api/v1/chat/messages
  Headers: x-user-id (optional)
  Body: { "message": "string" }
  Response: 201
  {
    "status": "success",
    "message": "...",
    "data": {
      "sessionId": "uuid",
      "reply": "agent response text"
    }
  }

POST /api/v1/chat/sessions/:sessionId/messages
  Headers: x-user-id (optional)
  Body: { "message": "string" }
  Response: 200
  {
    "status": "success",
    "message": "...",
    "data": {
      "sessionId": "uuid",
      "reply": "agent response text"
    }
  }
```

### Response standardization

Success responses go through a NestJS interceptor that wraps the controller's return value in the `ApiResponse` envelope. Errors (HTTP ≥ 400) go through a NestJS exception filter that maps exceptions to the same `ApiResponse` shape with `status: 'error'`.

### Error shape

```json
{
  "status": "error",
  "message": "Session not found",
  "data": null
}
```

### Streaming readiness

The `ChatService` interface returns a full response for v1. When streaming is added, the controller will inspect an `Accept` header or `stream` query param and switch to an SSE response. `ChatService` will expose a separate `.stream()` method that the controller delegates to. No breaking changes to the request-response path.

### Cleanup

The unused `src/conversation/` directory (containing `MessageEntity` and `MessageDto`) is deleted. LangGraph checkpointing owns message history; there is no dual-write to application tables.

### What stays unchanged

- `AgentService.invoke()` continues to work as-is. It gains a `checkpointSaver` in its `createReactAgent` call so that LangGraph persists state across invocations for the same `thread_id`.
- The ingestion pipeline is untouched. Files are uploaded via `POST /ingest/file` and embedded into the vector store through the existing RabbitMQ flow.
- The Telegram webhook continues to call `AgentService` directly until a future PR adds the adapter.

## Testing Decisions

### What makes a good test

Tests verify behavior through public interfaces only. They describe what the system does, not how. A test should survive internal refactors.

### Modules tested

- **ChatService** — unit tests using direct instantiation (Pattern B from existing codebase). Tests session creation, message sending, and session continuation. `AgentService` is mocked.
- **ChatController** — unit tests using `Test.createTestingModule` (Pattern A). Tests request validation, response shape via interceptor, and error mapping via exception filter.

### Prior art

- `src/ingestion/ingestion.service.spec.ts` — direct instantiation pattern for services
- `src/ingestion/ingestion.controller.spec.ts` — direct instantiation pattern for controllers
- `src/receipt/receipt.service.spec.ts` — `TestingModule` pattern for services with multiple dependencies

### Integration tests

Deferred. The agent's behavior depends on the LLM, vector store, and web search — these are inherently integration concerns. Unit tests with mocks verify the chat layer's orchestration. Full end-to-end chat tests require a test database with embeddings and a mocked LLM, which is out of scope for v1.

## Out of Scope

- **Streaming (SSE)** — v1 is request-response only. The interface is designed to add streaming later.
- **Postgres checkpointer** — v1 uses in-memory `MemorySaver`. Postgres-backed checkpointing is a follow-up.
- **Agent tool for user documents** — The agent cannot yet query ingestion jobs by user ID. It only has knowledge base and web search tools. Adding a `get_user_documents` tool is a separate task.
- **Telegram webhook adapter** — The Telegram webhook continues to call `AgentService` directly. Moving it to call through `ChatModule` is future work.
- **Authentication** — `x-user-id` header is optional, same as the ingestion controller. No JWT, API key, or session auth.
- **Global interceptor / exception filter** — The response interceptor and exception filter are scoped to `ChatModule` for v1. Promoting them to global is a separate decision.
- **Message history API** — No endpoint to retrieve past messages. LangGraph stores them internally for agent context, but there is no public history endpoint.
- **File references in chat** — No `fileIds` parameter. The agent accesses documents through its knowledge base tool, which queries the vector store.

## Further Notes

- The agent currently creates a fresh `createReactAgent` on every `invoke()` call. Adding a `checkpointSaver` means the agent still creates a new instance per call, but LangGraph loads prior state from the checkpointer for the given `thread_id`, giving continuity.
- The `thread_id` in LangGraph config maps to the chat `sessionId`. This keeps the mapping simple: one session = one LangGraph thread.
- The API prefix `/api/v1` is new for this project. Existing controllers use unprefixed paths. This sets a convention for future versioned endpoints without changing existing routes.
