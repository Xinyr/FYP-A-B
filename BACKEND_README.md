# FinSight Backend Database and Persistence

This README explains the current backend implementation for FinSight Phase 1 and Phase 2. It shows what has been implemented, which files are important, how to create or update the database through Supabase SQL Editor, how to run Phase 2 ingestion, and how to verify the backend.

## Current Backend Scope

The current backend contains two completed phases.

| Phase | Name | Status |
| --- | --- | --- |
| Phase 1 | Database Foundation | Completed |
| Phase 2 | Transactional Ingestion Persistence | Completed |

The backend now stores ingestion batches, accepted financial records and validation issues in PostgreSQL/Supabase. I also added source_file across the three main tables so we can trace which financial file each batch, record and validation issue came from.
Phase 2 connects the ingestion output to the database using a transactional persistence flow. VALID and WARNING records are accepted into financial_records, while REJECTED records are not stored as accepted financial records.

## Phase 1 Database Foundation

Phase 1 provides the PostgreSQL database structure used to store financial ingestion results.

The three main tables are:

| Table | Purpose |
| --- | --- |
| `ingestion_batches` | Stores one ingestion attempt, source filename, processing status and row counts |
| `financial_records` | Stores accepted financial records together with source filename and lineage |
| `validation_issues` | Stores warning and validation evidence associated with accepted records |

The current schema contains `source_file` in all three tables so the original financial file can be identified directly.

The physical column order begins with:

```text
ingestion_batches
id
source_file
ingestion_batch_id
schema_version
ruleset_version
status
...

financial_records
id
source_file
batch_id
ingestion_batch_id
transaction_date
...

validation_issues
id
source_file
financial_record_id
issue_ordinal
rule
...
```

The verified current schema contains:

```text
3 main tables
58 columns
11 indexes
5 application triggers
```

The database also includes UUID identities, foreign key relationships, exact financial `NUMERIC` storage, validation constraints, source file consistency protections, indexes, triggers, row level security configuration and restricted client access.

## Phase 1 Database Setup

The operational database workflow uses the Supabase SQL Editor.

Do not use migration CLI commands as the database setup method.

### Existing Phase 1 Database

Use:

```text
supabase/sql/phase1-source-file-upgrade.sql
```

This script is for an existing Phase 1 database that needs the source file provenance upgrade.

It adds source filename support to the required tables and preserves the existing financial record filename field.

Do not run the clean setup script over an existing Phase 1 database.

## Phase 2 Transactional Ingestion Persistence

Phase 2 connects the ingestion result to PostgreSQL and persists accepted financial data transactionally.

The main flow is:

```text
Financial CSV or XLSX
        ↓
File inspection and ingestion
        ↓
VALID / WARNING / REJECTED
        ↓
Backend persistence validation
        ↓
Persistence mapping
        ↓
Single PostgreSQL transaction
        ↓
ingestion_batches
financial_records
validation_issues
        ↓
COMMIT
        ↓
Persistence receipt
```

The persistence rules are:

| Status | Meaning | Persistence result |
| --- | --- | --- |
| `VALID` | Record passed validation | Stored in `financial_records` |
| `WARNING` | Record is accepted but requires attention | Stored in `financial_records` and warning evidence may be stored in `validation_issues` |
| `REJECTED` | Record has a serious validation problem | Not stored as an accepted financial record |

## Source File Provenance

The backend automatically derives the basename of the physical input file.

Example input:

```text
tests/phase2_financial_input_2.csv
```

Stored value:

```text
phase2_financial_input_2.csv
```

The full local path is not stored.

The same authoritative filename is persisted in:

```text
ingestion_batches.source_file
financial_records.source_file
validation_issues.source_file
```

The backend and database consistency checks prevent rows from the same persistence attempt from silently using different source filenames.

## Important Files

| File | Purpose |
| --- | --- |
| `lib/server/cli/phase2.ts` | Phase 2 command line entry point |
| `lib/server/persistence/contracts.ts` | Persistence request and receipt contracts |
| `lib/server/persistence/validate.ts` | Validates persistence input before database work |
| `lib/server/persistence/map.ts` | Maps accepted ingestion results into persistence data |
| `lib/server/persistence/service.ts` | Persistence service boundary |
| `lib/server/persistence/repository.ts` | Executes transactional database persistence |
| `lib/server/persistence/source-file.ts` | Handles and validates source filenames |
| `lib/server/db/postgres.ts` | Server side PostgreSQL transaction adapter |
| `supabase/sql/phase1-clean-setup.sql` | Complete current Phase 1 schema for a new database |
| `supabase/sql/phase1-source-file-upgrade.sql` | Existing Phase 1 database source file upgrade |
| `supabase/tests/fixtures/phase1-original-schema.sql` | Original Phase 1 schema retained only for automated verification |
| `tests/persistence/` | Phase 2 persistence and CLI tests |
| `supabase/tests/` | Phase 1 and upgraded schema verification |

The original Phase 1 fixture is for automated verification only. It is not the operational database setup method.

## How to Read the Backend

For Phase 1, start with:

```text
supabase/sql/phase1-clean-setup.sql
docs/phases/phase-1/README.md
docs/database/initial-ingestion-foundation.md
```

For Phase 2, start with:

```text
lib/server/cli/phase2.ts
lib/server/persistence/service.ts
lib/server/persistence/repository.ts
docs/phases/phase-2/README.md
docs/database/phase-2-internal-persistence.md
```

For verification, start with:

```text
tests/persistence/
supabase/tests/
```

The source code and automated tests are the authoritative implementation.

Run Phase 2 using:

```powershell
corepack pnpm phase2:ingest <financial-file>
```

Example:

```powershell
corepack pnpm phase2:ingest tests/phase2_financial_input_2.csv
```

The command processes the file through the existing ingestion pipeline and then passes the accepted result into the Phase 2 persistence layer.

A successful run should report the ingestion counts and committed persistence result.

Do not automatically retry when the final database COMMIT outcome is uncertain.

## Database Transaction Behaviour

Each Phase 2 persistence attempt uses one PostgreSQL transaction.

The simplified database sequence is:

```text
BEGIN

create ingestion batch

insert accepted financial records

insert warning validation issues

verify persisted counts

mark batch ACTIVE

COMMIT
```

If persistence fails before COMMIT, the transaction is rolled back.

The backend keeps uncertain COMMIT handling explicit and does not silently retry the same attempt.

## Environment

Phase 2 requires server side PostgreSQL configuration.

Local environment files and credentials must not be committed.

Keep the following out of Git:

```text
.env.local
database passwords
connection strings containing credentials
CA certificate contents
runtime verification files
```

Database credentials must remain server side.

## Verification Commands

Run the complete Vitest suite:

```powershell
node node_modules/vitest/vitest.mjs run
```

Run TypeScript verification:

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Run ESLint:

```powershell
node node_modules/eslint/bin/eslint.js .
```

Run the server boundary verifier:

```powershell
node scripts/verify-server-boundary.mjs
```

Run the Phase 1 baseline and clean schema verifier:

```powershell
node supabase/tests/verify-local.mjs
```

Run the upgraded schema verifier:

```powershell
node supabase/tests/verify-upgraded.mjs
```

Run schema compatibility verification:

```powershell
node tests/persistence/schema-compatibility.mjs
```

The latest verified local result is:

```text
268 tests passed across 16 files
TypeScript PASS
ESLint PASS with the existing warning only
Server boundary PASS
Phase 1 verification PASS
Schema compatibility PASS
CLI isolation and hosted target guards PASS
```

## What Phase 1 and Phase 2 Currently Provide

Phase 1 provides the database foundation required to store ingestion batches, accepted financial records and validation evidence.

Phase 2 provides the transactional path that takes accepted ingestion results and persists them safely into PostgreSQL.

Together, the current backend flow is:

```text
Financial File
      ↓
Ingestion
      ↓
VALID / WARNING / REJECTED
      ↓
Phase 2 Backend Persistence
      ↓
PostgreSQL / Supabase

ingestion_batches
financial_records
validation_issues
```

The source filename is preserved across all three tables so stored data can be traced back to the financial file that produced it.

Additional Phase 1 and Phase 2 documentation is available under:

`docs/phases/phase-1/`

`docs/phases/phase-2/`

### Verification

Current local verification:

268 tests passed across 16 files

TypeScript PASS

ESLint PASS with the existing warning only

Server boundary PASS

Phase 1 schema verification PASS

Schema compatibility PASS

CLI isolation and hosted target guard PASS

The current backend scope includes completed Phase 1 and Phase 2 only.