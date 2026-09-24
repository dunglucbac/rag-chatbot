# PRD: User-Scoped Receipt Financial Agent

## Problem Statement

Users can upload receipts and the system can parse and persist itemized purchase data, but the chat agent cannot reliably answer questions about that data. A question such as "How many items did I pay for last week?" currently reaches a general LangGraph ReAct agent that can search uploaded documents or the web, but it has no function that queries the authenticated user's relational receipt records. The model may therefore provide an unsupported answer instead of a deterministic calculation.

The current chat session flow also returns a new session identifier while using a different identifier for the first LangGraph thread, does not persist conversation state across restarts, and does not verify session ownership. These gaps make multi-turn financial conversations unreliable and unsafe.

Users need a receipt-focused agent that decides when to call predefined, user-scoped functions; calculates financial results in code and SQL; and uses the LLM only to choose tools and explain structured results. The first release must focus on parsed receipts accessed through the Google-authenticated REST API. General document retrieval, web search, Telegram, and account-transaction analysis are later capabilities.

## Solution

Build a receipt-focused LangChain/LangGraph agent with a small, predefined set of structured tools. The agent will decide which tool to call from the user's natural-language question, while the backend injects the authenticated Google user ID into every tool and never exposes user identity as a model-controlled argument.

The first read tools will provide deterministic purchase summaries and paginated receipt-item search. They will support relative and explicit date ranges, calculate results in `Asia/Ho_Chi_Minh`, group monetary totals by currency, report categorization coverage, and return traceable merchant/date references. A policy layer will require receipt tools for personal-spending claims, retry once when the model fails to use a required tool, and fail closed rather than guess.

Chat sessions will be owned by authenticated users, use the public session identifier as the LangGraph thread identifier from the first message, and store checkpoints in PostgreSQL. Later vertical slices within this PRD will add asynchronous receipt-item categorization and two narrowly scoped write tools. All writes will create a pending action and require explicit user confirmation before execution.

## User Stories

1. As an authenticated user, I want to ask how many items I purchased last week, so that I can understand my recent consumption.
2. As an authenticated user, I want "last week" to have a consistent calendar meaning, so that repeated reports use the same boundaries.
3. As an authenticated user, I want reports to use the application's local timezone, so that purchases near midnight appear in the expected period.
4. As an authenticated user, I want to request a specific audit date range, so that I can investigate an uncommon period without changing normal report behavior.
5. As an authenticated user, I want item quantities to be summed, so that a line with quantity three counts as three purchased items.
6. As an authenticated user, I want missing quantities to count as one item, so that incomplete OCR does not silently remove line items from counts.
7. As an authenticated user, I want line-item count and purchased-unit count reported separately, so that I understand how the total was calculated.
8. As an authenticated user, I want spending totals grouped by currency, so that unrelated currencies are never added together without conversion.
9. As an authenticated user, I want to know which category and subcategory received the most spending, so that I can understand my purchase patterns.
10. As an authenticated user, I want the agent to inspect selected receipt items when aggregate data is insufficient, so that it can explain the purchases behind a category total.
11. As an authenticated user, I want item-detail queries paginated, so that large receipt histories do not overflow the model context.
12. As an authenticated user, I want stable pagination while new receipts are added, so that the agent does not skip or repeat items unexpectedly.
13. As an authenticated user, I want report answers to identify relevant merchants and dates, so that I can trace calculations back to recognizable receipts.
14. As an authenticated user, I want the agent to state when no matching receipt data exists, so that absence of data is not confused with zero spending.
15. As an authenticated user, I want the agent to disclose uncategorized items, so that category rankings are not presented with false certainty.
16. As an authenticated user, I want the agent to use only my receipts, so that another user's financial data can never influence my answer.
17. As an authenticated user, I want my chat session to remain private to my account, so that knowing another session identifier does not expose its history.
18. As an authenticated user, I want a new session's returned identifier to be its real conversation thread identifier, so that follow-up messages preserve context.
19. As an authenticated user, I want conversations to survive application restarts, so that financial discussions remain coherent over time.
20. As an authenticated user, I want old chat history removed after the retention period, so that sensitive financial conversations are not retained indefinitely.
21. As an authenticated user, I want to delete retained chat history, so that I can remove sensitive conversations before automatic expiration.
22. As an authenticated user, I want the agent to call receipt functions for personal financial questions, so that answers are based on stored evidence rather than model memory.
23. As an authenticated user, I want the agent to refuse unsupported financial claims when data access fails, so that technical failures do not become fabricated advice.
24. As an authenticated user, I want receipt calculations performed by application code and SQL, so that totals are deterministic and testable.
25. As an authenticated user, I want the LLM to explain structured results in natural language, so that accurate calculations remain easy to understand.
26. As an authenticated user, I want the agent to distinguish essential, discretionary, and unclassified spending, so that it can discuss saving opportunities without labeling purchases as objectively wasteful.
27. As an authenticated user, I want to tell the agent that a category, subcategory, merchant, or exact receipt item is essential or discretionary, so that analysis reflects my priorities.
28. As an authenticated user, I want preference changes to require confirmation, so that an ambiguous conversation cannot silently alter future financial analysis.
29. As an authenticated user, I want category corrections to require confirmation, so that model suggestions do not overwrite receipt metadata without approval.
30. As an authenticated user, I want a simple "yes" to confirm a single clear pending action, so that confirmation remains natural in chat.
31. As an authenticated user, I want ambiguous confirmations rejected, so that "yes" cannot execute the wrong action when multiple changes are pending.
32. As an authenticated user, I want pending actions to expire, so that an old confirmation cannot execute a stale financial-data change.
33. As an authenticated user, I want confirmed actions to execute at most once, so that retries do not create duplicate writes.
34. As an authenticated user, I want receipt items categorized into a consistent taxonomy, so that variations such as "grocery" and "groceries" aggregate together.
35. As an authenticated user, I want uncertain categorization stored as unknown, so that the system does not force misleading classifications.
36. As an authenticated user, I want receipt ingestion to finish even when categorization is delayed, so that extracted purchase facts remain available.
37. As an authenticated user, I want categorization coverage included in analysis, so that I know whether category conclusions are complete.
38. As an API client, I want chat to return one complete response, so that the first UI can use a simple request-response integration.
39. As an API client, I want expected tool errors represented consistently, so that I can distinguish no data, invalid ranges, and expired cursors.
40. As an API client, I want an absolute date-range limit, so that accidental large audits do not create unbounded database and model work.
41. As a developer, I want tool inputs validated by Zod schemas, so that the model can call only supported function contracts.
42. As a developer, I want tool outputs to be structured JSON, so that calculations, pagination, errors, and tests are provider-neutral.
43. As a developer, I want tools constructed with a server-captured user ID, so that the model cannot select a different user.
44. As a developer, I want a dedicated date-range resolver, so that relative dates are converted consistently outside the LLM.
45. As a developer, I want a dedicated cursor codec, so that pagination tokens are signed, validated, and testable independently.
46. As a developer, I want a dedicated receipt analytics interface, so that SQL aggregation and pagination are isolated from agent orchestration.
47. As a developer, I want a dedicated agent policy layer, so that required-tool use, call budgets, retries, and safe failure behavior are enforced consistently.
48. As a developer, I want the tool loop capped, so that a model cannot perform unlimited database calls for one message.
49. As a developer, I want the same tool contracts to work with OpenAI and Anthropic models, so that provider selection remains configurable.
50. As an operator, I want tool names, durations, and error codes logged without financial content, so that I can diagnose failures without copying private data into logs.
51. As an operator, I want categorization failures retryable through the existing event-driven pipeline, so that transient model failures do not require manual data repair.
52. As a maintainer, I want real LLM calls excluded from the required test suite, so that tests remain fast, deterministic, and inexpensive.

## Implementation Decisions

### Delivery sequence

The feature will be implemented as vertical slices in this order:

1. Correct chat session ownership/thread identity and add PostgreSQL-backed LangGraph history.
2. Add user-scoped receipt summary and receipt-item search tools.
3. Add the financial-agent prompt and policy enforcement, including required-tool validation, the retry-once/fail-closed rule, and the tool-call budget.
4. Add asynchronous item categorization, spending preferences, category correction, and confirmed write actions.

Each slice must leave the existing REST chat contract usable and independently testable.

### Agent scope and orchestration

- The first financial agent is receipt-focused. Its tools will not include knowledge-base search or web search.
- The Google-authenticated user ID is the canonical identity for chat, ingestion, receipt ownership, sessions, preferences, and pending actions.
- Telegram integration will be removed from the target architecture. Telegram user IDs will not be used by the financial agent.
- The agent will continue using a LangGraph ReAct pattern so that the model chooses among predefined functions.
- Tools will be constructed per invocation and will capture the authenticated user ID in server-side closures. `userId` will never appear in a tool schema exposed to the model.
- Tool inputs will use Zod validation and tool outputs will be structured JSON rather than prose.
- The agent will support both configured OpenAI and Anthropic chat-model providers through the existing LLM abstraction.
- A dynamic system prompt will contain only trusted runtime context: current date/time, `Asia/Ho_Chi_Minh`, tool-use rules, the confirmation policy, and the prohibition against guessing personal financial data.
- User messages and tool output will not be interpolated into the system prompt.
- The agent may make at most five tool calls for one user message. At the limit it will summarize available results or ask the user to narrow the request.
- Personal purchase, receipt, category, and spending claims require at least one approved receipt tool call. If the model drafts such an answer without a receipt tool call, the policy layer retries once with tool use required. A second failure returns a safe inability response.
- Version 1 is non-streaming. It returns one final answer and does not expose chain-of-thought or raw internal tool activity.

### Read tools

The initial read-only tools are:

- `get_purchase_summary`: returns deterministic receipt count, line-item count, purchased-unit count, totals grouped by currency, category/subcategory totals, categorization coverage, selected date boundaries, and recognizable receipt references.
- `search_purchase_items`: returns filtered receipt items and receipt references using signed keyset pagination.

The receipt analytics module is a deep module with a small service interface. It owns user-scoped relational queries, aggregation semantics, currency grouping, category coverage, sorting, pagination, and result DTOs. Agent tools depend on this interface and do not construct SQL.

### Time-range semantics

- Relative periods (`last_week` and `last_month`) are the default tool inputs; explicit start/end dates are also supported for uncommon audits.
- `last_week` means the previous calendar week from Monday at 00:00 through the next Monday at 00:00.
- `last_month` means the previous complete calendar month from day 1 at 00:00 through the following month’s day 1 at 00:00.
- All version 1 date boundaries use `Asia/Ho_Chi_Minh`.
- Per-user timezone preferences are deferred.
- Explicit date ranges may span at most 366 days in one tool call. Longer audits must be split into smaller deterministic summaries.
- A dedicated date-range resolver will convert validated relative/absolute inputs into half-open UTC timestamp boundaries for database queries.

### Counting and currency semantics

- Purchased-unit count is the sum of line-item quantities, using one when a stored quantity is missing.
- Line-item count and purchased-unit count are distinct fields.
- Receipt count is returned separately.
- Monetary values with different ISO 4217 currency codes are never added together.
- Currency conversion and exchange-rate lookup are not part of this release.

### Receipt-item pagination

- Item search defaults to 20 records and has a hard maximum of 50 records per call.
- Results are ordered deterministically by line-item total descending and item identifier descending.
- Pagination uses PostgreSQL keyset queries, not connection-bound database cursors and not offset/page-number pagination.
- The next cursor is an opaque, Base64URL-encoded payload signed with HMAC-SHA256 using a dedicated cursor secret that is separate from authentication secrets.
- Cursor state binds the authenticated user, sort position, filter fingerprint, date range, and expiration.
- Altered, expired, wrong-user, or filter-mismatched cursors return a structured expected error.
- Cursor payloads contain no receipt descriptions or other sensitive business data.
- Raw OCR receipt text is never returned to the model by an analytics tool.

### Tool results and errors

- Successful results include the resolved date range and an `asOf` timestamp.
- Recognizable provenance includes merchant, purchase date, currency, relevant totals, and stable receipt/item references. User-facing responses need not expose raw database identifiers.
- Expected conditions such as `NO_DATA`, `INVALID_DATE_RANGE`, `CURSOR_EXPIRED`, and `CATEGORIZATION_INCOMPLETE` use structured result codes that the agent can explain.
- Authorization failures and unexpected infrastructure errors fail closed, are not exposed as detailed tool messages to the LLM, and are logged without sensitive payloads.

### Session ownership and persistent history

- A chat-session record will associate each session identifier with exactly one authenticated Google user.
- A new session identifier is generated before the first agent invocation and is used as the LangGraph `thread_id` immediately.
- Continuing a session requires an ownership check; a user cannot resume another user's session.
- LangGraph checkpoints will be stored in PostgreSQL so history survives process restarts and works across multiple application instances.
- Chat history has a default retention period of 90 days and supports user-initiated deletion.
- Application-level encryption of checkpoint content is deferred. Tool output persisted in history must therefore be minimized.

### Receipt taxonomy and asynchronous categorization

- Categorization is a post-extraction enrichment stage. OCR extracts text, receipt parsing extracts purchase facts, and categorization infers category metadata.
- After receipt facts and line items are stored, an event requests categorization asynchronously. Receipt ingestion does not wait for categorization to finish.
- Categorization state is tracked as pending, completed, or failed, with retry support aligned to the existing RabbitMQ processing architecture.
- Category metadata records model provenance, confidence, and taxonomy version.
- Predictions below `0.70` confidence are stored as `unknown` for reporting; a suggested value may remain in diagnostic classification metadata.
- Summary results return categorized and uncategorized counts plus a coverage ratio.
- The initial versioned two-level taxonomy is:
  - food: groceries, dining
  - housing: rent, utilities, maintenance
  - transport: fuel, public transit, ride hailing, parking
  - health: medical, pharmacy, fitness
  - education
  - entertainment: subscriptions, events, games
  - shopping: clothing, electronics, household, general
  - travel
  - personal care
  - fees
  - gifts and donations
  - other
  - unknown

### Spending preferences and confirmed writes

- The financial language avoids storing or presenting `wasteful` as an objective fact. Preference classifications are `essential`, `discretionary`, or `unclassified`.
- Spending preference rules are stored as normalized rows rather than one JSON document.
- Rules are owned by user and may target category, subcategory, merchant, or one exact receipt item. Recurring item-name matching is deferred.
- A uniqueness constraint prevents conflicting duplicates for the same user and scope.
- The first write tools are `set_spending_preference` and `correct_purchase_category`.
- The agent cannot edit receipt amounts, dates, quantities, merchant facts, or delete receipts.
- Calling a write tool creates a pending action instead of mutating business data immediately.
- Pending actions persist in PostgreSQL with user, session, tool name, validated arguments, status, created time, and expiration.
- Pending actions expire after 15 minutes and execute at most once using a transactional state transition.
- A plain affirmative reply may confirm only when the same owned session has exactly one unexpired pending action. Otherwise the agent requires an explicit action reference.
- Rejection, expiration, execution, and failure are auditable states.
- Confirmation requirements are mandatory in this release. A future policy may support less restrictive modes, but no bypass is implemented now.

### Data access and privacy

- Every receipt, item, session, preference, and pending-action query includes the authenticated user constraint at the database layer.
- Tool schemas cannot accept user identifiers.
- Financial tool results are treated as untrusted data for prompting purposes; receipt text and item names cannot override system instructions.
- Operational logs include tool name, duration, success/error code, session identifier, and a hashed user identifier.
- Full prompts, receipt items, tool results, and pending-action arguments are not written to application logs.
- Infrastructure/database encryption at rest may be used where already available, but implementing application-level encryption is out of scope.

### Major modules

- **Receipt analytics module:** deterministic summaries, item search, categorization coverage, currency grouping, and provenance.
- **Date-range resolver:** relative/absolute time parsing and UTC boundary generation for the fixed application timezone.
- **Signed cursor codec:** HMAC signing, verification, expiration, and filter binding for keyset pagination.
- **Financial agent policy:** trusted system prompt construction, required-tool enforcement, retry/fail-closed behavior, tool budget, and safe error mapping.
- **Chat session module:** user ownership, session lifecycle, PostgreSQL checkpoint integration, retention, and deletion.
- **Receipt categorization module:** versioned taxonomy classification, confidence handling, event consumption/publication, retry status, and persisted metadata.
- **Spending preference module:** scoped preference rules and deterministic precedence evaluation.
- **Pending action module:** proposal, expiration, confirmation, idempotent execution, rejection, and audit status.

These modules intentionally expose small stable interfaces so their security and financial semantics can be tested independently from model behavior.

## Testing Decisions

Good tests exercise public behavior and stable contracts rather than private implementation details. Financial calculations, access control, time boundaries, pagination, confirmation, and policy enforcement must be deterministic. Required automated tests will not call real LLM APIs.

### Receipt analytics tests

- Verify authenticated user isolation for summaries and item search.
- Verify previous-calendar-week boundaries in `Asia/Ho_Chi_Minh`, including UTC conversion and daylight-independent behavior for the selected zone.
- Verify explicit date validation and the 366-day limit.
- Verify purchased-unit sums use quantity and fall back to one only when quantity is missing.
- Verify receipt count, line-item count, and purchased-unit count remain distinct.
- Verify monetary totals are grouped by currency.
- Verify category/subcategory totals and categorization coverage.
- Verify no-data and partially categorized results.
- Verify merchant/date provenance is returned without raw OCR text.

### Pagination and cursor tests

- Verify default and maximum page sizes.
- Verify deterministic keyset ordering and correct traversal across equal prices.
- Verify no skipped or duplicated records across normal pages.
- Verify signed cursor round trips.
- Verify altered payloads/signatures, expiration, wrong-user use, and filter mismatch are rejected.
- Verify cursor payloads do not contain receipt content.

### Chat session and history tests

- Verify first messages use the returned session identifier as the LangGraph thread identifier.
- Verify follow-up messages load the same persisted history after service recreation.
- Verify users cannot resume or delete another user's session.
- Verify retention cleanup and user-initiated deletion behavior.

### Agent and tool-contract tests

- Unit-test each LangChain tool with mocked deep-module interfaces.
- Use a fake chat model to verify tool selection, structured outputs, expected errors, pagination continuation, and final answer synthesis.
- Verify `userId` is absent from model-visible tool schemas and is injected server-side.
- Verify personal financial answers require an approved receipt tool call.
- Verify the agent retries once when required tool use is missing and then fails closed.
- Verify the five-call budget stops runaway loops.
- Verify dynamic prompts contain trusted current time/timezone and do not promote user/tool content into system instructions.
- Run the same provider-neutral tool-contract suite for OpenAI and Anthropic model adapters.
- Keep real-provider smoke tests optional and manual.

### Categorization tests

- Verify the classifier can emit only taxonomy version 1 values.
- Verify confidence below `0.70` produces `unknown` reporting state.
- Verify categorization requests occur after receipt persistence and do not block receipt availability.
- Verify completion, failure, and retry behavior through public event handlers.
- Verify a failed enrichment never deletes or corrupts extracted receipt facts.

### Preference and confirmation tests

- Verify rules are isolated by user and unique by scope.
- Verify exact receipt-item rules affect only their target item.
- Verify write tools create pending actions without immediately changing business data.
- Verify confirmation requires the owning user and session.
- Verify plain "yes" succeeds only with one unambiguous unexpired action.
- Verify expired, rejected, already executed, and concurrent confirmations cannot mutate data twice.
- Verify category corrections and preference changes are the only supported agent writes.

### API tests

- Extend the existing chat controller tests for authenticated session ownership, error mapping, and unchanged non-streaming response envelopes.
- Extend service tests for new-session creation, continuation, persistence, and safe failures.
- Use existing receipt service/repository unit and integration tests as prior art for TypeORM-backed financial behavior.
- Use existing message-queue consumer tests as prior art for asynchronous categorization events.

## Out of Scope

- Account transactions, bank transfers, card/e-wallet transaction ingestion, and receipt/transaction matching. These are explicitly planned for the next stage.
- General PDF/document RAG and `search_knowledge_base` in the receipt-focused agent.
- Web search and price comparison.
- Telegram chat, Telegram review prompts, Telegram identity linking, and Telegram as a source of canonical user identity.
- A dedicated UI or settings screen.
- Streaming responses, SSE, and exposure of intermediate agent steps.
- Currency conversion or exchange-rate lookup.
- Per-user timezone selection; version 1 uses `Asia/Ho_Chi_Minh`.
- Date ranges larger than 366 days in one tool call.
- Arbitrary SQL tools, arbitrary database access, and model-generated query execution.
- Automatic writes without confirmation.
- Agent edits to receipt merchant, amount, date, quantity, tax, currency, or deletion state.
- Recurring preference rules based on fuzzy item-name matching.
- Application-level encryption of chat checkpoints or tool results.
- Automatic classification of spending as objectively wasteful.
- Production use of real LLM APIs in the required automated test suite.

## Further Notes

- The existing relational receipt tables remain the source of truth for receipt analytics. Vector similarity search is not suitable for exhaustive counts, sums, date filtering, or user-scoped financial calculations.
- The existing code already creates a ReAct agent and LangChain tools per invocation. The first implementation should preserve that shape while replacing general search tools with user-scoped receipt functions.
- The current first-message session/thread mismatch must be corrected before relying on persistent checkpoints.
- The existing repository documentation contains forward-looking references to receipt-search tooling and Telegram flows that do not match the current implementation or this agreed direction. Architecture and glossary documentation should be reconciled as implementation slices land.
- PostgreSQL server-side cursors are intentionally not used because they are connection- and transaction-bound. "Cursor pagination" in this PRD means stateless keyset pagination with signed application tokens.
- HMAC cursor signing provides integrity, not confidentiality. Cursor payloads must remain non-sensitive.
- The categorization model's output is inferred metadata, not OCR-extracted fact. Provenance, confidence, and taxonomy version preserve that distinction.
- The agreed initial module and testing boundaries are reflected above: deep deterministic modules receive direct tests, while model behavior is tested through fake provider-neutral chat models.
