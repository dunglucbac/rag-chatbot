# Vietnamese Stock Research and Investment Journal

Status: agreed product scope from the grill-me interview; implementation started.
Updated: 2026-11-06, Asia/Ho_Chi_Minh.

The first backend slice adds an authenticated investment event journal and
migration. It records and retrieves user-owned stock interest, decisions,
reported trades, and position snapshots with request deduplication. Holdings
calculation, chat/UI integration, research jobs, provider access, and budget
enforcement remain unimplemented.

## Objective

Add Vietnamese stock research and a personal investment journal to the existing
RAG chatbot. Selectively reuse TradingAgents' decision workflow in a separate
Python worker. The reason for selective reuse is reducing code and maintenance
scope; the full workflow still involves multiple model calls.

This plan supersedes the earlier Kronos-first direction. Kronos and Trading-R1
are outside this version. Earlier preferences carried forward are Vietnamese
reports, a 3–12 month investment horizon, manual position context, no position
sizing, and VCB, VIC, VHM, MSR, and MWG as initial validation stocks.

## Confirmed Decisions

- Keep the current NestJS application and add a separate Python research worker.
- Reuse selected TradingAgents components rather than maintain a full upstream
  fork or copy its CLI, unused data providers, and unrelated features.
- Include market, fundamentals, and news analysts, bull/bear researchers,
  research manager, trader proposal, aggressive/conservative/neutral risk
  discussion, and portfolio manager. Social sentiment is deferred.
- Use Finhay market data and user-uploaded company-report PDFs. Additional
  Vietnamese feeds and automated document collection are deferred.
- Run the full workflow on an explicit analysis or refresh request. Follow-up
  questions use a saved report and its evidence rather than rerun the pipeline.
- Proceed with Finhay when PDFs are missing. Produce partial findings when
  evidence is incomplete, and withhold a rating if essential data is missing.
- Produce a five-level stock-attractiveness assessment with supporting evidence,
  risks, and conditions that would change the assessment. Keep personal context
  separate from the evidence-based stock rating.
- Store dated AI assessments, user decisions and reasons, interest changes,
  transactions, and position history.
- Save clear conversational updates automatically and show what changed. Ask
  for clarification when an update is ambiguous.
- Use the existing PostgreSQL database, adding investment records alongside
  receipt records. Record reported trades; do not place brokerage orders.
- Maintain one combined portfolio per user. Preserve buys and sells and derive
  holdings; accept a dated starting position when earlier trades are unknown.
- Track low/medium/high interest with notes and history, independently of whether
  the user owns shares. Unknown interest remains unset.
- Add an Investments section with a stock list and stock details containing
  assessments, decisions, holdings, transactions, and chat access.
- Show basic valuation: shares, average cost, invested amount, latest market
  value, and estimated unrealized profit/loss with the quote timestamp.
- Reuse the application's configured LLM provider and model for all roles first.
  Measure cost and quality before introducing multiple model tiers.
- Enforce a US$10 monthly pilot AI budget. At exhaustion, pause paid analysis;
  retain access to stored reports and manual portfolio updates.

## User Workflows

### Request an assessment

An explicit request such as "Analyze VCB" creates a background job. Return a
durable report reference and show progress in Investments. Fetch a dated Finhay
snapshot, retrieve relevant owned PDF passages, and run the research pipeline.
Save the final report, rating or evidence-insufficient state, sources, model and
prompt versions, runtime, usage, and partial-failure information.

Refreshing creates a new assessment. Preserve earlier reports and the evidence
used by each; do not overwrite their conclusions with later information.

### Ask follow-up questions

Use the selected assessment and its evidence for questions about its reasoning.
Display the assessment date and distinguish that snapshot from newly requested
quotes. Asking a question or changing a position does not implicitly trigger a
new full analysis.

### Record decisions and positions through chat

- "VCB looks attractive, but it is not the right time to buy" records a user
  decision to wait when that meaning is clear. Preserve the AI rating separately.
- "I bought 500 VCB shares at 54,000 VND today" records a reported purchase and
  updates the holding, using the user's local date.
- "I now hold 500 VCB shares" records a dated position snapshot. It does not
  fabricate historical purchases or an unknown average cost.
- "I am very interested in MWG" updates interest to high and preserves the note.

Distinguish intended trades from completed trades: "I might buy 500 shares" is
a note or decision, not an executed purchase. Validate updates server-side and
make writes idempotent so retries cannot duplicate trades. Corrections retain
history and explicitly supersede earlier entries.

Manual updates must remain possible after the AI budget is exhausted through
the Investments UI; natural-language interpretation may itself require paid
model calls and cannot be promised for free.

### Review the portfolio

Show one combined portfolio with owned shares and tracked stocks. Each stock
shows current interest, latest assessment and its date, latest user decision,
position, and quote freshness. Its detail view exposes the underlying report,
evidence, journal, transactions, and position history.

Do not calculate a cost-based return when acquisition cost is unknown. Identify
partial or stale valuations. V1's unrealized profit/loss is not a total-return
measure including dividends, taxes, or all historical cash flows.

## Integration Design — Engineering Proposals

The following boundaries and implementation defaults are proposals, not
implemented interfaces or additional user commitments.

### Reuse the application infrastructure

The current repository has authenticated chat and uploads, PostgreSQL/TypeORM,
RabbitMQ ingestion jobs, pgvector storage, and a Python OCR/document worker.
The active chat agent is receipt-specific. Add an investment route and service
boundary with its own evidence policy, preserving receipt behavior.

NestJS should own authentication, Finhay authorization, investment persistence,
report jobs, budget reservations, and validated journal/portfolio writes. The
research worker should receive a scoped job and research evidence and return
analysis; model-generated proposals must not directly mutate holdings.

Reuse RabbitMQ with dedicated investment routing and bounded retries. Keep the
research worker independently deployable from the OCR worker: the existing OCR
environment includes heavy image and ML dependencies that the research engine
does not inherently need.

Persist ownership and correlation IDs at every job boundary. Validate worker
results and store completion only for the matching owner and job. Separate
investment chat context from receipt chat context.

### Selective TradingAgents reuse

Before copying, choose an upstream commit and inspect the dependency closure of
the selected graph, agents, state, and model adapters. Keep the original license,
required notices, attribution, upstream revision, copied-file manifest, and a
short record of local adaptations. Dependency size must be measured rather than
inferred from the number of copied source files.

Replace upstream vendor calls with reviewed Finhay and document tools. Adapt
trader and manager outputs to the agreed stock-assessment schema and 3–12 month
horizon. A trade proposal is research output, not a recorded personal trade.

Use bounded model/tool retries and debate depth. Start with a small fixed debate
limit, measure usefulness, and increase it only when justified. A role's name
does not imply it needs its own model or independently trained weights.

### Finhay and evidence

An authenticated Finhay connection available in this coding conversation is not
an application connection. Verify app-owned authorization, read-only market
scope, token refresh, and reconnect behavior before relying on it in deployment.
Keep tokens out of prompts, report evidence, queues, and traces.

Fetch and normalize required market facts deterministically and cache them by
their source and date. An implementation may expose bounded tools for additional
facts; the LLM must not have access to the whole remote tool catalog.

Preserve currency, units, accounting period, consolidated/standalone status,
publication and retrieval timestamps, and price-adjustment semantics. Identify
missing or uncertain fields. Do not treat two sources with a common origin as
independent verification or silently reconcile conflicting values.

Define and test rating prerequisites for each stock type during the first
implementation slice. Missing optional PDFs should not by itself block a rating;
missing essential financial evidence should. A failed optional analyst can yield
a partial report; a technical failure that leaves no usable evidence must be
reported as such rather than presented as an assessment.

### PDF retrieval

The current vector service stores documents in `document_embeddings` and exposes
an unfiltered similarity-search method. The existing knowledge-base tool formats
source text but does not establish stock-, owner-, or period-scoped retrieval,
and it is not registered in the active receipt agent.

Extend document ingestion and retrieval to support owner, stock identity,
document title/type, reporting period, publication date, file reference, and
page references. Confirm page and table extraction quality with actual reports;
the presence of a PDF parser does not establish usable financial-report RAG.

Filter documents server-side before retrieval. Retain original files and source
passages so the user can inspect citations. Treat document text as untrusted
evidence. Use structured data or validated extraction for calculations rather
than assuming semantically similar passages contain exact table values.

### Investment storage and valuation

Reuse the database, not the receipt-item schema. Receipt items require a parent
receipt and feed spending summaries. Proposed investment records cover:

- An owned tracked stock with canonical instrument identity.
- Immutable assessment versions and their evidence references.
- User decision and interest events with effective dates and source messages.
- Reported buy/sell events, position snapshots, and correction references.
- Derived positions and an AI usage/reservation ledger.

Keep one authoritative record for each reported trade. Use precise decimal
arithmetic for quantities and money. A proposed v1 cost convention is weighted
average acquisition cost with explicitly supplied fees included; label missing
fees, do not infer taxes, and do not claim tax-accounting results. Sales must
reduce holdings and remaining basis consistently. Unknown opening cost must
remain unknown. Dividends and corporate actions must not silently be treated as
ordinary purchases; unsupported cases need an explicit correction/snapshot path.

Persist source-message IDs and event identities for deduplication. Validate
stock identity, quantity, price units, currency, and transaction dates. Ask for
missing information needed to interpret an update rather than guessing it.

Assessments and journals are durable investment records. Do not implicitly delete
them when existing 90-day chat retention removes a conversation.

### Budget and observability

Proposed budget scope is investment-feature model calls and PDF embeddings,
including report follow-ups, with a calendar-month reset in Asia/Ho_Chi_Minh.
Keep existing receipt-feature spending separate. This scope must be visible in
settings; external data-provider fees are separate from model usage.

Reserve a conservative cost allowance atomically before paid work and reconcile
actual usage afterward. Enforce limits across concurrent jobs, retries, and
follow-ups. Stop initiating calls when there is insufficient allowance. Verify
the configured provider's pricing or tariff, especially for a custom endpoint;
unpriced requests cannot support a trustworthy USD spending guard. Provider
invoices can differ from estimates, so report the accounting basis explicitly.

Current Langfuse tracing is development/test-only. Reuse it for prototype quality
and cost inspection where practical, but budget enforcement and usage storage
must work without tracing. Do not add a new observability dependency or SDK
version solely for this planning phase.

## Delivery and Verification

1. Technical spike: select the upstream revision, establish selective reuse and
   required dependencies, test the current model endpoint from Python, and verify
   application Finhay auth and representative financial/PDF data contracts.
2. One end-to-end VCB workflow: explicit request, background job, three analysts,
   full downstream decision graph, dated cited report, partial-data behavior, and
   a visible budget reservation and usage record.
3. Investment journal and portfolio: automatic clear updates, clarification for
   ambiguity, transaction and snapshot handling, corrections, interest history,
   and basic valuation in the Investments UI.
4. Extend validation to VIC, VHM, MSR, and MWG; verify behavior across banks and
   non-banks and with missing, scanned, conflicting, and stale documents.

Required checks cover authentication and ownership, schema validation, PDF
retrieval/citations, explicit-versus-planned trades, retry deduplication,
concurrent position writes, corrections and missing cost basis, quote freshness,
budget races and exhaustion, job failures, and preservation of receipt behavior.

Compare full-workflow reports with a simpler single-agent reference using the
same evidence snapshots. Review factual support, useful counterarguments,
uncertainty, and horizon relevance; record tokens, cost, and latency. Do not
claim predictive value or Vietnamese-market investment performance from report
quality alone. Point-in-time backtesting and automated learning are deferred.

## Deferred Scope

Social sentiment, VNStock and other additional feeds, automatic web/PDF
collection, brokerage execution or automatic holdings sync, multiple portfolios,
position sizing, detailed realized/total-return reporting, daily automatic full
assessments, local models, multiple model tiers, Kronos, and Trading-R1.

## References

- [TradingAgents repository](https://github.com/TauricResearch/TradingAgents)
- [Workflow graph](https://github.com/TauricResearch/TradingAgents/blob/main/tradingagents/graph/setup.py)
- [Current application architecture](architecture.md)
- [Receipt item model](../src/receipt/entities/receipt-item.entity.ts)
- [Vector store](../src/vector-store/vector-store.service.ts)
- [Chat service](../src/chat/chat.service.ts)
- [Current LLM factory](../src/llm/llm.service.ts)
- [Existing Python worker dependencies](../python-worker/pyproject.toml)
