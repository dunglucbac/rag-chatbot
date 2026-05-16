# CLAUDE.md

Guidance for working in this repository.

## Project overview

This is a NestJS monolith focused on receipt intelligence and chat-based spending analysis.

Core flow:
- Telegram receives user messages
- Agent service routes requests through LangGraph / LangChain
- Ingestion processes uploaded receipts and documents
- PostgreSQL + TypeORM store relational data
- pgvector stores embeddings for retrieval
- Web search and scraping enrich the knowledge base over time

The architecture is documented in `docs/architecture.md` and should be treated as the source of truth for system design.

## High-level architecture

Current modules:
- `ConfigModule` for environment configuration
- `DatabaseModule` for TypeORM and PostgreSQL
- `LlmModule` for Claude / GPT model abstraction
- `VectorStoreModule` for PGVector read/write
- `WebSearchModule` for Tavily search and search logs
- `IngestionModule` for file ingestion and parsing
- `ReceiptModule` for receipt analytics and summaries
- `AgentModule` for the LangGraph ReAct agent
- `TelegramModule` for the Telegraf bot and webhook
- `ScraperModule` for background web scraping

When adding new functionality, follow the same modular NestJS approach.

## Code organization rules

### Module-local structure

Keep feature-specific code inside the feature folder.

Preferred layout:
- `src/<module>/<module>.module.ts`
- `src/<module>/<module>.service.ts`
- `src/<module>/<module>.controller.ts`
- `src/<module>/entities/`
- `src/<module>/dtos/`
- `src/<module>/<module>.types.ts`

### Repository pattern

Use a repository layer for persistence and keep orchestration in services.

Preferred pattern:
- `src/repositories/base/base.interface.repository.ts` for shared repository contracts
- `src/repositories/base/base.repository.ts` for shared repository behavior
- `src/repositories/<feature>.repository.ts` for domain-specific repositories
- `src/<feature>/<feature>.service.ts` for orchestration and workflow logic

Guidelines:
- Repositories should wrap TypeORM or other persistence concerns.
- Services should call repositories and coordinate business flow.
- Keep TypeORM details out of controllers and most services when possible.
- Add domain-specific repository methods only when they are truly persistence-related.

### Generic pattern

Prefer shared generic helpers for repeated shapes and workflows.

Examples:
- `BaseRepositoryInterface<T>` for repository contracts
- `BaseRepository<T>` for common CRUD behavior
- shared pagination/sort response types in `src/common/common.types.ts`
- common dispatch/event envelope helpers in `src/common/`

Rules:
- Use generics when the behavior is reusable across multiple modules.
- Keep generic helpers small and predictable.
- Do not over-abstract feature-specific logic into shared code.
- If a helper needs domain-specific branching, keep it in the feature module instead.

### Types

- Put module-scoped TypeScript types in `<module>.types.ts` when the module needs reusable type definitions.
- Keep source-of-truth literals and unions centralized in the module type file.
- Use shared types only when they are truly cross-module.
- If a type is reused across modules, move it to `src/common/` instead of duplicating it.
- Avoid defining reusable types inline in services, controllers, or entities.

### DTOs

- Put DTO classes in a `dtos/` folder, not alongside services or controllers.
- DTOs should be named clearly, e.g. `ingestion-job.dto.ts`, `create-receipt.dto.ts`.
- DTOs should represent transport shapes only.
- Keep entity-to-DTO mapping in the DTO class or in a dedicated mapper if it grows.

### Entities

- Keep TypeORM entities in `entities/`.
- Do not mix entity definitions with DTOs or service logic.
- Entity names and database table names should remain explicit and predictable.

### Shared code

- If code is reused across multiple modules, create or extend a `src/common/` module or shared folder.
- Do not copy shared helpers into multiple modules.
- Shared utilities should be intentionally generic and not tied to one feature area.

## Naming and consistency rules

- Use singular, descriptive names for entities and DTOs where appropriate.
- Prefer `PascalCase` for classes and `camelCase` for variables and functions.
- Use `readonly` where possible for injected dependencies and static constants.
- Keep enums / union literals aligned between entity columns, DTOs, and module types.

## Ingestion-specific guidance

For ingestion work, follow these conventions:
- Define ingestion types in `src/ingestion/ingestion.module.types.ts`.
- Put ingestion DTOs in `src/ingestion/dtos/`.
- Keep ingestion entities in `src/ingestion/entities/`.
- Prefer `IngestionJobService` for persistence and `IngestionService` for orchestration.
- Keep source-type and status literals centralized so entity columns and DTOs stay consistent.

## Workflow expectations

- Read the architecture docs before making structural changes.
- Update docs when architectural behavior changes.
- Add new modules only when the feature boundary is meaningful.
- Favor small, composable services over large all-purpose classes.
- If a new feature overlaps existing shared behavior, move common logic into `src/common/`.

## Useful commands

- `npm run start:dev` — run the app in watch mode
- `npm run build` — build the project
- `npm run lint` — lint the codebase
- `npm run migration:generate -- --name MigrationName` — generate a TypeORM migration
- `npm run migration:run` — run migrations

## Notes for contributors

- Check `docs/architecture.md` first for design intent.
- Keep the ingestion pipeline aligned with the receipt-first product direction.
- Treat the chatbot as retrieval + reasoning over stored data, not as a manual expense-entry app.
- When unsure where code belongs, prefer module-local placement first, then promote to `src/common/` only if shared.
