# Phase 2 demonstration: real internal transactional persistence

Database setup/update is exclusively through Supabase SQL Editor using `supabase/sql/phase1-clean-setup.sql` (empty database) or `supabase/sql/phase1-source-file-upgrade.sql` (existing original foundation). The internal original schema fixture is never a setup method. Hosted FYP A has not received the source-file upgrade; no hosted ingestion is authorized by this guide.

The normal developer CLI remains `corepack pnpm phase2:ingest tests/phase2_financial_input.csv`; it consumes the real physical CSV through Chia, validates/maps accepted results, and invokes the server-only Phase 2 writer. Normal invocation intentionally loads `.env.local`, so do not run it against existing hosted configuration until separately authorized. See `PHASE_2_CLI.md` for its configuration and output.

For safe local demonstration/verification, open PowerShell in the repository and run:

```powershell
corepack pnpm exec vitest run tests/persistence/repository.integration.test.ts --reporter=verbose
corepack pnpm exec vitest run tests/persistence/cli.test.ts tests/persistence/database-target.test.ts --reporter=verbose
```

These existing tests create disposable local PostgreSQL, apply current clean-schema SQL and use the real pg adapter/repository/service. The physical-CSV integration case invokes the real CLI service path and proves all three tables contain the same basename. No hosted setup, developer environment loading, fake direct SQL replacement or extra demonstration helper is used.

Show the allowed storage tests: VALID/WARNING acceptance, rejected exclusion, exact NUMERIC values, UUID relationships, warning ordering, counts and ACTIVE completion. Show rollback and lost-COMMIT-acknowledgement tests; they assert safe errors and no automatic retry. CLI tests demonstrate ingestion and preflight before database initialization, no false SUCCESS, and isolated child-process environments. Target-guard tests are pure configuration checks.

Local automated schema preparation is test infrastructure only. It does not instruct a user to create or update an operational database from the terminal. Original-baseline and current-schema verification remain separate:

```powershell
node supabase/tests/verify-local.mjs
node supabase/tests/verify-upgraded.mjs
node tests/persistence/schema-compatibility.mjs
```

The upgraded/current schema has 58 columns, 11 indexes, 5 application triggers and direct `source_file` columns on all three tables. Historic new columns may be NULL; no filename is fabricated. This documentation update does not change Chia classification, financial mapping, transaction semantics or credentials.
