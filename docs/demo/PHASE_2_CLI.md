# Internal Phase 2 file ingestion CLI

Database schema provisioning is performed only through Supabase SQL Editor. Use `supabase/sql/phase1-clean-setup.sql` for an empty database, or `supabase/sql/phase1-source-file-upgrade.sql` for existing original Phase 1 tables. Hosted FYP A has not received the source-file upgrade; do not run the updated writer there until separately authorized and verified. Original schema fixtures are internal local test/history artifacts, never operational setup instructions.

## Source filename provenance update (local verification only)

The prepared schema upgrade has **not been deployed to hosted FYP A**. Hosted execution requires separate approval and schema verification. Do not run the updated writer against the old hosted schema.

Use `source_file` consistently: it is new on `ingestion_batches` and `validation_issues`, and remains the existing column on `financial_records`. No `source_file_name` column is introduced. New persistence attempts use one validated basename across the three tables. Historical new columns remain NULL; existing record provenance is preserved verbatim. No historical filenames are fabricated.

## Filename flow and compatibility

The developer command remains:

```powershell
corepack pnpm phase2:ingest tests/phase2_financial_input.csv
```

It derives `phase2_financial_input.csv` automatically. No second filename argument is required. Do not run this command against the existing hosted configuration until deployment and ingestion are separately authorized.

```text
physical file -> validated basename -> Chia file metadata
-> persistence request.source_file -> validated plan.batch.source_file
-> ingestion_batches.source_file
-> existing financial_records.source_file
-> validation_issues.source_file
```

The CLI supplies `source_file` explicitly. Retained internal `{ results }` callers can omit it: preflight derives one authoritative value from verified producer file metadata. An explicit value must match every result, including results later consolidated. Different filenames in one attempt are rejected; multiple sheets of one file remain supported. This metadata is provenance, not durable request identity.

Filename validation requires a nonblank string of at most 255 Unicode characters, with no path separators or control characters, excluding `.` and `..`. Useful spelling and Unicode are retained. Paths are never persisted as filenames. Chia already trims/sanitizes and shortens names over 160 characters; the CLI fails safely if Chia changes the physical basename instead of silently storing a different filename. Chia remains unchanged.

The repository binds the single name as SQL parameters. It verifies each record name agrees with the batch before writing and assigns each issue the batch name. Database triggers enforce matching names for named batches, lock parents during child checks, and prevent changing a batch name after records exist. Legacy NULL batch/issue names remain allowed; a non-NULL legacy issue name must match its record. Historical NULLs are not silently backfilled. Financial record names remain NOT NULL as before.

Accepted VALID/WARNING records and ordered warning evidence retain the existing behavior. REJECTED rows contribute counts but are excluded from accepted storage. Transaction/count/ACTIVE/commit-before-receipt, rollback and uncertain-COMMIT handling are unchanged. No automatic retry, security phase or lifecycle feature is added.

Run the local integration test to exercise the real physical CSV, Chia, service, repository and pg adapter using disposable loopback PostgreSQL:

```powershell
corepack pnpm exec vitest run tests/persistence/repository.integration.test.ts
corepack pnpm exec vitest run tests/persistence/cli.test.ts
```

These tests do not load developer `.env.local`. Missing-configuration subprocess tests retain the explicit test-only environment-loader disable switch and an allowlisted environment. Normal developer invocation still intentionally loads `.env.local`, so it is not a safe substitute for the local tests here.

From PowerShell in `C:\Users\celes\Downloads\COS40005 FYP\FYP A JQ\FYP`, run:

```powershell
pnpm phase2:ingest tests/phase2_financial_input.csv
```

Requires Node 24 (synchronous module hooks), installed development dependencies including TypeScript, and the existing server configuration: `SUPABASE_DATABASE_URL`, optionally `SUPABASE_DATABASE_CA_CERT`. The CLI loads the repository-root `.env.local` using Node's native environment loader. Existing process variables take precedence. This file is Git ignored and must never be shared. Never display configuration values or put credentials in source/command history.

Hosted connections are refused by default before pool creation. Explicit FYP A authorization requires FINSIGHT_PHASE2_ALLOW_HOSTED_FYP_A=YES and FINSIGHT_PHASE2_FYP_A_PROJECT_REF matching the Direct host db.<project-reference>.supabase.co, PostgreSQL database/user, port 5432 and certificate-verified TLS. Local loopback remains allowed. No schema provisioning, migration, seed or reset is performed. The target database must already have the compatible foundation and an internal account permitted to insert the three tables, complete batches and read their counts. The original unscoped Phase 2 path does not supply application membership/session authorization. Do not expose this internal tool as a frontend endpoint. Authentication/cybersecurity integration is a separate team responsibility.

The requested CSV was absent when this tool was implemented. It was created using existing synthetic fixture rows. Canonical `transaction_date` and the supported `amount` alias are processed by Chia's existing default signed-amount mapping. Other files can be passed as the one path argument; CSV/XLSX inspection and classification remain in Chia. Mapping uses the existing approved suggestions and default options, not an interactive mapping UI.

Call chain: physical read → Chia inspectFile/createDataset/suggestMapping/approveMapping/ingestDataset → real IngestionResult[] → preparePersistencePlan (existing validation/mapping) → createPersistenceService/createPersistenceRepository → transactionDatabase → pg. There is no test runner in this runtime path and no use of phase2-demo.test.ts.

Printed ingestion counts come from the actual summaries. Validation/mapping messages follow successful preflight. Only then does the CLI check PostgreSQL configuration and create its pool. Missing configuration prints DATABASE_CONFIGURATION and exits nonzero after the real ingestion/preflight output; no persistence is started. A receipt is received only after the existing transaction adapter acknowledges COMMIT. A second read transaction verifies persisted status and record/issue counts; only then does SUCCESS print. No amounts, source cells, connection values or underlying errors are logged. If the post-commit read fails, work may already be committed even though SUCCESS is absent.

Each invocation intentionally creates a new Phase 2 attempt. It is not idempotent; do not run again to retry uncertainty. All-rejected input retains Phase 2's EMPTY_ACCEPTED_BATCH_UNSUPPORTED behaviour. No batch with rejected accepted-storage rows is introduced.

Example format only; UUID is a placeholder and these values are not a live database verification:

```text
Reading financial file: tests/phase2_financial_input.csv

CHIA INGESTION RESULT
Rows received: 3
VALID: 1
WARNING: 1
REJECTED: 1

PHASE 2
Validation: PASSED
Mapping: PASSED

DATABASE
Batch ID: <actual PostgreSQL-generated UUID>
Accepted records inserted: 2
Warning issues inserted: 1
Transaction: COMMITTED
Batch status: ACTIVE

SUCCESS
```

Verification: 8 CLI tests exercise real ingestion, mapping, service, repository and transaction code, with only SQL transport substituted; subprocess tests execute the normal Node entry point. Success, record/issue handling, insert failure, commit uncertainty, post-commit observation failure, missing input/configuration, remote denial and loopback database unavailability are checked. A relevant no-schema test selection passed 121 tests in 10 files. Targeted CLI TypeScript, lint and server boundary passed. Repository-wide typecheck and a broader test selection are blocked by missing pre-existing expected.json/bank_statement.xlsx fixtures. No fixtures outside the requested CSV were reconstructed.

No local PostgreSQL listener was available on the usual port during implementation. The ordinary CLI was run against a controlled unavailable loopback target: it printed actual Chia counts and successful preflight, then DATABASE_UNAVAILABLE, exit 1, without SUCCESS. A live successful PostgreSQL write has not been verified in this task. Database/schema provisioning tests were excluded because migrations/seeds/resets were forbidden.

Local-only `.env.local` placeholders (fill privately; hosted consent remains NO until deliberately authorized):

```dotenv
SUPABASE_DATABASE_URL="<MY_REAL_CONNECTION_URI>"
FINSIGHT_PHASE2_FYP_A_PROJECT_REF="<MY_FYP_A_PROJECT_REF>"
FINSIGHT_PHASE2_ALLOW_HOSTED_FYP_A="NO"
```

The project reference is the portion between db. and .supabase.co in the FYP A Direct hostname. The opt-in confirms target authorization; it does not itself verify deployed tables or their compatibility. Before an authorized hosted write, inspect intended project identity and existing schema read-only, review internal account privileges, TLS, unscoped ownership and recovery. No hosted connection or ingestion was run while preparing this mechanism. The pure target-guard tests passed 13 cases; targeted TypeScript, lint and server-boundary checks passed.
