# Working on FilBucket

How to contribute, run tests, stay sane.

## Tooling requirements

- Node 22+
- pnpm 10
- Postgres 16
- Redis 7
- MinIO (or any S3-compat)
- A text editor with good TypeScript support (VS Code / Cursor / Zed)

## Workspace layout (pnpm)

```
filbucket/
├── apps/web       — Next.js 15, React 19
├── apps/server    — Fastify + workers
├── apps/mac       — SwiftUI macOS app
├── packages/shared — zod + TS types, imported by both web and server
```

## The most useful commands

```bash
pnpm install                     # first time
pnpm dev                         # runs web (3010) + server (4000) + worker
pnpm -r typecheck                # strict tsc everywhere
pnpm -r build                    # prod build of web + server + shared
pnpm -r lint                     # (Phase 2; stubbed in Phase 1)
pnpm -r test                     # (Phase 2)

# Database
pnpm --filter @filbucket/server db:generate    # diff schema, emit migration
pnpm --filter @filbucket/server db:push --force # apply to local DB
pnpm --filter @filbucket/server db:seed         # create dev user + bucket

# Chain helpers
pnpm --filter @filbucket/server setup-wallet
```

## Branching

- `main` — always green, auto-deployed to staging (when we have staging).
- `feature/<short-name>` — your branch.
- PRs to main require:
  - `pnpm -r typecheck` clean
  - `pnpm -r build` clean
  - manual smoke test if UI/UX changed

Conventional commits required: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`.

## Code style

- TypeScript strict everywhere. No `any`. No `!`. No `as` unless truly needed.
- Zod at every API boundary (schemas live in `packages/shared/src/api.ts`).
- Drizzle for all DB work. No raw SQL except where necessary (we use it for a DISTINCT ON query in files list; document any others).
- UI strings: follow the [glossary](https://github.com/Reiers/filbucket/blob/main/GLOSSARY.md). No crypto words in primary UX.
- Never log private keys, passwords, or session tokens. Pino is configured to redact.

## Testing philosophy

Phase 1 is still light on tests. Plan:

- Phase 2: integration test suite with a spun-up calibration wallet + seeded DB
- Phase 3: contract-testing with mock Synapse + full CI

For now: **if you touch the durability worker or the shares routes, write a CLI repro** (curl script) and include it in your PR.

## How to add a new API route

1. Schema in `packages/shared/src/api.ts`
2. Zod parse at the top of the handler in `apps/server/src/routes/*.ts`
3. Register in `apps/server/src/index.ts`
4. Add a section to `docs/api/*.md`
5. Add client helper in `apps/web/src/lib/api.ts` (+ type)
6. Use it in the UI

## How to add a new file state

1. Add to `fileStateEnum` in `apps/server/src/db/schema.ts`
2. `pnpm --filter @filbucket/server db:generate && db:push --force`
3. Add to `FILE_STATE_VALUES` and `FILE_STATE_LABEL` in `packages/shared/src/file-state.ts`
4. Add to the `StatusBadge` `styles` map in `apps/web/src/app/page.tsx`
5. Document in `docs/concepts/file-states.md`

## Filing issues

Good issues carry:

- Reproduction steps
- Environment (local dev / staging / prod)
- Relevant `commit_events` from `/api/files/:id` when it's a durability question
- FilBucket commit sha
- Screenshots for UI bugs

## Security issues

Do not file publicly. Email `security@filbucket.ai`. We'll triage fast.
