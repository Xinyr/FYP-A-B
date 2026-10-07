# FinSight backend/database workspace

## Source filename provenance update (local verification only)

The prepared schema upgrade has **not been deployed to hosted FYP A**. Hosted execution requires separate approval and schema verification. Do not run the updated writer against the old hosted schema.

Use `source_file` consistently: it is new on `ingestion_batches` and `validation_issues`, and remains the existing column on `financial_records`. No `source_file_name` column is introduced. New persistence attempts use one validated basename across the three tables. Historical new columns remain NULL; existing record provenance is preserved verbatim. No historical filenames are fabricated.

Phase 1's primary setup workflow is SQL Editor with `supabase/sql/phase1-clean-setup.sql` for an empty database, or the additive `phase1-source-file-upgrade.sql` for an existing foundation. The original schema is an internal test/history fixture; the seed remains local verification data. SQL Editor is the only operational setup/update method. See the Phase 1 and Phase 2 READMEs for instructions and local-only verification. No hosted deployment is included in this change.

Personal backend development workspace for database foundation and transactional ingestion persistence. This repository no longer contains or runs the original Next.js frontend.

## Development

Use the pinned pnpm package manager with a Node runtime supported by the installed dependencies (verification uses the existing local Node runtime).

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:persistence
pnpm test:db
pnpm test:ingestion
pnpm check:server-boundary
```

`pnpm test` covers all retained ingestion compatibility and persistence tests. Retained integration tests use disposable PGlite over the actual pg wire protocol. All use synthetic data and require no hosted credentials.

## Structure

- `lib/server/`: validated/mapped ingestion results, PostgreSQL adapter, repository and internal persistence service.
- `lib/ingestion/`: unchanged required Chia engine/contracts and public barrel, used by persistence and producer compatibility tests.
- `tests/persistence/` and `tests/ingestion/`: backend and meaningful producer compatibility coverage.
- `public/samples/ingestion/`: four synthetic test fixtures, retained at existing paths to preserve test and implementation bytes. There is no public HTTP server.
- `supabase/sql/`: operational SQL Editor setup/update scripts; `supabase/tests/`: disposable local verification and immutable baseline fixture.
- `docs/database/`: Phase 1/2 implementation records and current workspace cleanup plan/results.
- `scripts/`: actual server-only conditional-import verification.

The sibling `Chia Data` folder preserves the complete ingestion reference and supporting context. `Cleanup Backup` preserves the original project. Neither is an install dependency or part of this repository.

## Server boundary and database configuration

The adapter/repository/service retain `import "server-only"`. The package's default import deliberately throws. Trusted Node ESM entry points must use `node --conditions=react-server`; tests mock the marker only within the existing test harness. React and Next.js are not needed for this conditional export. This is an internal architecture guard, not authentication or authorization.

Only the server environment supplies `SUPABASE_DATABASE_URL` and optional `SUPABASE_DATABASE_CA_CERT`. Never use `NEXT_PUBLIC_`, commit real values, expose URLs or connect privileged persistence to a browser. Runtime remote TLS remains verified. This workspace does not supply a deployment/build contract or public API.

The internal Phase 2 service requires `intent: "NEW_ATTEMPT_NO_RETRY"`. This checkpoint has no durable request identity, idempotent replay or technical reconciliation.

## Backend roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Database Foundation | Completed |
| 2 | Transactional Ingestion Persistence | Completed |
| 3 | Durable Requests, Reconciliation and Batch Lifecycle | Planned / next |
| 4 | Backend API and Dashboard Ready Data Services | Planned |

Security/cybersecurity is a separate team responsibility. This backend retains Phase 1/2 correctness and safety controls; it provides no authentication or authorization service and must not be exposed as an unrestricted public writer. Neither planned phase is implemented on main.
