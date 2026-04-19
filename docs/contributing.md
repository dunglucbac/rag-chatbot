# Contributing

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for the local database)
- An `.env` file configured from `.env.example`

## Local Setup

```bash
npm install
docker-compose up -d
npm run start:dev
```

## Project Conventions

### Module structure

Each feature lives in its own NestJS module under `src/`. A module typically contains:

```
src/<feature>/
├── <feature>.module.ts
├── <feature>.service.ts
├── <feature>.controller.ts   (if it exposes HTTP endpoints)
└── entities/
    └── <entity>.entity.ts    (if it owns database tables)
```

### Code style

Formatting and linting are enforced automatically:

```bash
npm run format   # prettier
npm run lint     # eslint --fix
```

Prettier config (`.prettierrc`): single quotes, trailing commas everywhere.

ESLint config (`eslint.config.mjs`): `typescript-eslint` recommended + prettier. Notable rule relaxations:
- `@typescript-eslint/no-explicit-any` — off
- `@typescript-eslint/no-floating-promises` — warn (not error)
- `@typescript-eslint/no-unsafe-argument` — warn (not error)

Fix lint errors before opening a PR.

### TypeScript

- Target: ES2023, module resolution: `nodenext`
- `strictNullChecks` enabled — avoid `!` non-null assertions unless the value is guaranteed by the framework
- `noImplicitAny` is off — but prefer explicit types on public service methods
- `emitDecoratorMetadata` and `experimentalDecorators` enabled for NestJS and TypeORM
- Build excludes `*.spec.ts` files and `test/` directory (`tsconfig.build.json`)

## Testing

```bash
npm run test          # run all unit tests once
npm run test:cov      # with coverage report
npm run test:e2e      # end-to-end tests (requires a running database)
```

Tests live alongside source files as `*.spec.ts`. There is no `test/` directory — e2e tests would go there if added. Currently only `app.controller.spec.ts` exists; new services and controllers should have corresponding spec files.

### Writing tests

Use `@nestjs/testing` to create isolated module contexts:

```ts
const module = await Test.createTestingModule({
  providers: [
    MyService,
    { provide: MyDependency, useValue: mockDependency },
  ],
}).compile();
```

Avoid mocking the database for integration tests — use a real PostgreSQL instance via Docker.

Jest config (in `package.json`):
- `rootDir`: `src`
- `testRegex`: `.*\.spec\.ts$`
- `transform`: `ts-jest`
- Coverage output: `../coverage`

## Adding a New Tool to the Agent

1. Create `src/agent/tools/<name>.tool.ts` exporting a factory function:

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export function createMyTool(dependency: MyService) {
  return tool(
    async ({ input }) => {
      return dependency.doSomething(input);
    },
    {
      name: 'my_tool',
      description: 'When and why the agent should use this tool.',
      schema: z.object({ input: z.string() }),
    },
  );
}
```

2. Inject the dependency into `AgentService` and add the tool to the `tools` array in `AgentService.invoke`.

3. Update [docs/architecture.md](architecture.md) with the new tool's name, description, and side effects.

## Adding a New LLM Provider

1. Add the provider's LangChain package to `dependencies` in `package.json`.
2. Add a new branch in `LlmService.getModel()` returning a `BaseChatModel`.
3. Add the corresponding API key to `.env.example` and `src/config/configuration.ts`.
4. Document the new option in the environment table in [README.md](../README.md).

## Pull Request Checklist

- [ ] `npm run lint` passes with no errors
- [ ] `npm run test` passes
- [ ] New environment variables are added to `.env.example` and `src/config/configuration.ts`
- [ ] Architecture or API docs updated if behaviour changed
