# Backend workspace instructions

This is Celester's personal FinSight backend/database workspace, not a Next.js application.

Keep Phase 1 operational SQL/test fixtures/seeds and Phase 2 persistence behavior unchanged unless the user requests a backend change. Database access remains internal and server-only; never log credentials, connection URLs, financial rows or raw database errors.

Chia owns `lib/ingestion/`. Treat its retained contract and implementation as authoritative. Read the actual models, engine modules and retained tests before consuming or changing them. The unchanged reference documentation is in the sibling `Chia Data` folder. Do not modify that reference or `Cleanup Backup` during cleanup. The forbidden sibling repository must never be accessed.

Retain exact decimal strings, independent dates, accepted VALID/WARNING eligibility, issue order and source lineage. Use the existing validation/mapping service; do not duplicate producer contracts or add browser persistence.

Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm check:server-boundary` after relevant changes. Persistence integration tests use a disposable local PGlite database and the current clean-schema SQL. No hosted connection is needed. A trusted Node ESM entry point importing server-only modules must run with `--conditions=react-server`; ordinary imports should fail. No automatic retry/idempotency guarantee exists.

Hosted database setup and schema updates use Supabase SQL Editor only. Operational scripts live under `supabase/sql/`. The original schema under `supabase/tests/fixtures/` is immutable local test/history evidence, never a setup method. Do not execute hosted SQL without explicit authorization.
