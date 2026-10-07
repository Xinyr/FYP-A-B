# Phase 1 demonstration: SQL Editor database foundation

## Canonical clean-schema column order

The clean SQL defines `source_file` directly as column 2 on all three tables:

- `ingestion_batches`: `id`, `source_file`, `ingestion_batch_id`, `schema_version`, `ruleset_version`, `status`, then the remaining foundation columns.
- `financial_records`: `id`, `source_file`, `batch_id`, `ingestion_batch_id`, then the remaining financial/lineage columns.
- `validation_issues`: `id`, `source_file`, `financial_record_id`, `issue_ordinal`, then the remaining evidence columns.

The existing-database additive upgrade remains unchanged and cannot reorder PostgreSQL columns. Clean and upgraded schemas retain equivalent behavior, but their physical order differs; verification compares named-column semantics while separately checking clean order. Original baseline fingerprints remain unchanged.

No existing-database reorder script is supplied. Rebuilding established tables solely for physical order risks existing data, object identities, dependent objects and privileges. Use explicit SELECT column lists when order matters. Hosted FYP A may contain data: it was not inspected or modified here, and its physical order is not claimed to have changed.


## Operational database workflow: Supabase SQL Editor only

Hosted FYP A may contain rows following separately performed source-file upgrade and Phase 2 processing. No hosted state was reverified here. Neither script was executed against hosted FYP A during this repository change.

1. Open Supabase Dashboard.
2. Select the correct project: FYP A.
3. Open SQL Editor.
4. Click New query.
5. Paste the complete appropriate SQL script from the table below.
6. Click Run only after separate hosted execution approval.
7. Verify `ingestion_batches`, `financial_records` and `validation_issues` in Table Editor.
8. Run the read-only metadata verification documented in the Phase 1 demo.

| Database state | SQL to paste |
| --- | --- |
| Empty database with no Phase 1 tables | `supabase/sql/phase1-clean-setup.sql` |
| Existing original Phase 1 tables, with or without rows | `supabase/sql/phase1-source-file-upgrade.sql` |

The clean script contains the complete current schema in one transaction, without seed/demo data. Never run it over existing Phase 1 tables. The upgrade adds only the missing source-file support and protections; it preserves existing schema/data and performs no fabricated backfill. It is a one-time upgrade: check the schema before applying it again. Do not run either script in fragments.

Operational SQL is version-controlled under `supabase/sql/`, but hosted execution is exclusively through SQL Editor. No migration CLI, VS Code SQL execution or terminal schema setup is part of this workflow. The original schema under `supabase/tests/fixtures/phase1-original-schema.sql` is immutable local test/history evidence, **never a setup method**. The unchanged synthetic seed is used by local verification, not included in either operational script.

Current schema: 3 tables, 58 columns, 11 indexes, 5 application triggers, RLS enabled, no client policies, client table privileges denied. `source_file` is present directly in all three tables; the existing record column remains NOT NULL while new batch/issue columns allow unknown historical provenance as NULL.

Local automated verification is separate from operational setup:

```powershell
node supabase/tests/verify-local.mjs
node supabase/tests/verify-upgraded.mjs
node tests/persistence/schema-compatibility.mjs
```

The original-baseline verifier uses only the internal fixture. Current integration uses clean SQL; upgraded-schema verification uses the original fixture plus operational upgrade and compares it with clean SQL. All databases are disposable/local and no hosted configuration is loaded.

## Presentation: approximately 5 to 7 minutes

Perform only separately authorized SQL Editor execution. For the existing FYP A project, choose the upgrade, never clean setup. No data insertion is needed to demonstrate schema structure. The following queries are read-only and do not expose credentials or financial contents.

### 1. Select the SQL (1 minute)

**Action:** Follow the eight Dashboard/SQL Editor steps above, checking the project and existing tables first.

**Exact SQL:** Paste the entire appropriate operational file. For existing FYP A, use `supabase/sql/phase1-source-file-upgrade.sql` only after separate approval.

**Expected result:** Successful transaction; no demo rows inserted. If an object already exists or any statement fails, stop, inspect the error and existing schema; do not use clean setup or broadly ignore errors.

**Show:** The selected project and successful SQL Editor result.

**Say:** "Phase 1 creates database storage and enforces its invariants. This update adds filename provenance while preserving the existing foundation."

### 2. Show the tables and filename columns (1 minute)

**Action:** Open Table Editor, then run this metadata query in a new SQL Editor query.

**Exact SQL:**

```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ingestion_batches', 'financial_records', 'validation_issues')
  AND column_name IN ('id', 'source_file')
ORDER BY table_name, column_name;
```

**Expected result:** Six rows: UUID IDs with database defaults and three `source_file` columns. Financial-record filename is NOT NULL; batch/issue filename permits historical NULL.

**Show:** All three tables and their columns.

**Say:** "Each table has a permanent database-generated UUID. One basename is preserved across a new persistence attempt; unknown historical provenance is not invented."

### 3. Show exact amounts and relationships (1 minute)

**Action:** Inspect storage types and constraints.

**Exact SQL:**

```sql
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'financial_records'
  AND column_name IN ('debit', 'credit', 'source_amount', 'derived_ledger_net', 'balance')
ORDER BY column_name;

SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.ingestion_batches'::regclass,
                  'public.financial_records'::regclass,
                  'public.validation_issues'::regclass)
  AND contype IN ('p', 'f', 'u', 'c')
ORDER BY table_name, conname;
```

**Expected result:** Five unrestricted NUMERIC columns. Constraints include UUID primary keys, batch/record relationships, accepted VALID/WARNING status, WARNING-only issues and unique ordered issue ordinals.

**Show:** NUMERIC types, foreign keys and accepted-status checks.

**Say:** "Exact financial storage, accepted-only records and attached warning evidence are enforced in PostgreSQL. Phase 2 supplies the transactional writer separately."

### 4. Show indexes, triggers and client protection (1 to 2 minutes)

**Action:** Run read-only catalog queries.

**Exact SQL:**

```sql
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('ingestion_batches', 'financial_records', 'validation_issues')
ORDER BY tablename, indexname;

SELECT tgrelid::regclass AS table_name, tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid IN ('public.ingestion_batches'::regclass,
                 'public.financial_records'::regclass,
                 'public.validation_issues'::regclass)
  AND NOT tgisinternal
ORDER BY table_name, tgname;

SELECT c.relname, c.relrowsecurity,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('ingestion_batches', 'financial_records', 'validation_issues');

SELECT count(*) AS client_policy_count FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ingestion_batches', 'financial_records', 'validation_issues');
```

**Expected result after upgrade:** 11 indexes, 5 application triggers, RLS true on all three tables, both client SELECT grants false, zero policies.

**Show:** Two deferred warning consistency triggers and three filename consistency triggers.

**Say:** "The database keeps warning evidence and filenames consistent. Ordinary client roles cannot directly read these protected tables. This foundation does not implement application authentication."

### 5. Show independent local verification (1 minute)

**Action:** Show results of the local verification commands listed above, run beforehand.

**Expected result:** Original fingerprints remain valid; clean setup and original fixture plus upgrade produce equivalent current schemas: 58 columns, 11 indexes, 5 triggers. Synthetic tests prove exact decimals, VALID/WARNING storage, REJECTED exclusion and historical NULL compatibility.

**Show:** PASS results without secrets or real financial information.

**Say:** "Tests use disposable local PostgreSQL. They verify the SQL; they are not the hosted setup workflow. No sample data or schema was applied to hosted FYP A during this documentation change."

## Troubleshooting

- Existing tables: choose the additive upgrade, even if row counts are zero.
- Existing source-file upgrade objects: stop and compare schema; do not rerun blindly or suppress errors.
- SQL failure: stop and check the transaction result. Do not drop tables, disable protections or retry an uncertain result automatically.
- Table Editor does not list tables: confirm project/schema and refresh; verify metadata before taking action.
- Local verifier dependency missing: use the repository's documented pinned runtime/dependencies. Never substitute hosted credentials for local verification.
- Fingerprint mismatch: inspect the first failed assertion and preserve SQL protections. No hosted repair is authorized by a local test failure.
