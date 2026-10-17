# Phase 4 internal accepted-data persistence: group verification

## Provenance and Git state

- Approved source: `jiaqi538/FYP`, `feature/phase4-accepted-persistence`, commit
  `e5f1be27d2a735df150daad9080e03749ab237f7`, tree
  `a0dc34df319c5290c526cde0a501272543df814e`.
- Destination: `Xinyr/FYP-A-B`, `features/backend-celester`, starting commit
  `b8dafae640c240e8b9bd216bbc19ba19e0a0057f`.
- Latest fetched group main: `2dd5d0885b4e686ee2e01cb5c2ee243d3fa2ba3f`
  (merged PR #3).
- Isolated local verification branch: `integration/phase4-backend-verification`.
  It starts at the backend branch and holds an uncommitted merge of main. The
  original backend checkout, backend branch ref, and main ref are not advanced.
  No commit, push, PR, or hosted database change is authorized by this work.

The histories share the initial commit, but the latest main already integrated
the reviewed backend by selective transfer rather than ancestry. The uncommitted
merge resolves 19 stale add/add or README conflicts with exact current-main
versions, preserving the integrated application, dependency/configuration files,
ingestion exports, existing backend fixes, and security checks. The backend's
existing Phase 1/2 README files remain intact; they were absent from main and are
not newly transferred Phase 4 work. A future approved merge commit would retain
both backend and current-main parents; no history rewrite is proposed.

## Selective transfer

The following approved source files are copied without functional changes:

- `.gitattributes`
- `lib/server/persistence/accepted-plan.ts`
- `lib/server/persistence/grouped.ts`
- `lib/server/persistence/map.ts`
- `lib/server/persistence/validate.ts`
- `supabase/sql/phase4-accepted-data-upgrade.sql`
- `tests/persistence/phase4-migration-cases.ts`
- `tests/persistence/phase4-migration.test.ts`

Two further approved test files are reused with only their fixture-helper import
changed from `./consultation-fixtures` to the existing `../integration/fixtures`:

- `tests/persistence/accepted.integration.test.ts`
- `tests/persistence/grouped.postgres.test.ts`

The existing group server-boundary verifier adds `persistence/accepted-plan.ts`
while preserving Jason's authorization/audit checks. This group-specific handoff
document replaces the personal-workspace report. These are the only two newly
authored compatibility/documentation files beyond the approved source files.
The transferred `.gitattributes` additionally pins the group's existing LF
`docs/handoff/examples/ingestion-evidence.json`: Git's Windows CRLF conversion
otherwise fails its existing byte-for-byte export regression. Its committed
content is reused exactly; no producer code, test, fixture data or hashes change.

Intentionally excluded from the personal 30-file commit:

- Chia's C1/C2 modules, public exports, contract, example, manifest, producer tests
  and fixture guard: already integrated in main; retained verbatim.
- CSV fixture changes: main already contains the exact published CRLF blobs.
  All four published fixtures are reused unchanged; the new attributes preserve
  their bytes across future checkouts and retain normal whitespace checks.
- Connection cleanup fix and SQL verifier fixes: already integrated in main.
- Personal PostgreSQL cleanup tests: main has fuller existing coverage, retained.
- Personal fixture-helper duplicate: reuse the group integration helper instead.
- Personal package scripts and backend-only AGENTS instructions: preserve the
  group's Next.js root, existing scripts, configuration and owner instructions.
- Personal report: its single-repository inventory/results are not group evidence.

## Internal flow and compatibility

```ts
const payload = createAcceptedDataPayload(results); // existing actual C1/C2 path
const attempt_id = crypto.randomUUID(); // retain before persistence
const receipt = await createGroupedPersistenceService(database)
  .persistAcceptedAttempt({ attempt_id, payload });
```

The server-only adapter validates reduced schema/ruleset 0.1 data directly,
without rebuilding raw rows, rejected candidates, profiles or mappings. It checks
dataset and source lineage, exact decimal strings, dates, representations,
warnings, transformations, accepted status/counts, and producer summary consistency
before opening the shared C3-B1 transaction. Existing full-engine inputs retain
their stricter validation. The established Phase 2 writer persists one atomic
attempt, per-dataset batches, accepted records and ordered warnings. No rejected
financial rows are inserted. Producer IDs, filenames, worksheet/hash/row/timestamp
lineage and declared received/rejected quality counts are preserved. Omitted raw
evidence cannot independently substantiate those producer-declared summary claims.

All-rejected and zero-row datasets retain COMPLETED_EMPTY batches. No-dataset
submissions and repeated dataset entries are rejected. Independent producer runs
remain supported. Unknown COMMIT and unconfirmed rollback propagate without
retry; callers retain the preallocated UUID and investigate on the same writable
primary. Existing grouped receipts and Phase 2 behavior remain intact.

## Migration and nullable financial semantics

Disposable local databases apply the group's existing Phase 1 clean setup and
unchanged C3-B1 grouped upgrade, then the new Phase 4 migration. Historical tests
instead seed the immutable original fixture before applying the existing upgrades.
No existing migration, canonical contract or hosted schema is modified.

The new migration takes an ACCESS EXCLUSIVE table lock, validates the complete
named predecessor definition against the exact expected expression parsed on
that same database version, and replaces only that verified constraint. Missing,
renamed, modified, unvalidated or conflicting targets fail transactionally. Other
constraints are untouched. The exact validated replacement with no predecessor
is an idempotent no-op. Failed explicit transactions require runner rollback.

NULL ledger-derived net means **unavailable, never zero**. It is allowed at the
database layer for ledger rows only when source debit and credit are supplied;
any non-null derived value must still equal exact debit minus credit. Existing
finite-value, monetary-basis, source-amount/direction, date, warning, foreign-key
and server-only access safeguards remain. The migration updates no financial
rows. The adapter fills in no debit, credit, balance or calculated values. Legacy
full-engine service inputs still require their established correct derived value.

Frederick must review future database-backed analytics/reporting consumers:
`aggregateCanonicalRecords` in the inspected main can sum available ledger values
while omitting unavailable ones. Mixed-availability totals must not look complete,
and `COALESCE(derived_ledger_net, 0)` must not imply that unknown means zero. The
existing C1 `aggregateSourceRecords`/`analyzeAcceptedDataPayload` path carries
explicit interpretation availability and remains unchanged. Coordinate equivalent
database-read semantics with Frederick and dashboard/report consumers; coordinate
with Chia if any future producer change is proposed. None is required here.

## Security and deployment gates

There is no HTTP route or browser persistence call. Jason's module is unchanged.
Before exposing persistence or investigation, agree and implement verified identity
tokens, trusted active membership/roles, stored actor/organization attempt ownership,
existing authorization-policy wiring, and a protected persistent audit sink with
defined failure ordering. Knowing an attempt UUID is not authorization. Do not log
financial contents, filenames, raw database errors, credentials or warning evidence.
Route tests must cover unauthenticated, wrong-owner/organization, denied-role,
audit-failure and uncertain-outcome cases. External transport/versioning, request
limits and sensitive evidence retention also require owner agreement.

Hosted SQL Editor execution, lock/validation deployment planning, group commit,
push, PR and merge require their respective approvals. No hosted database or
teammate ingestion, analytics, security, frontend or reporting module is edited.

## Actual local group verification: 16 October 2026

- Focused adapter, migration, existing consultation, analytics integration and
  fixture checks: 77 tests passed in six files.
- `pnpm test --maxWorkers=2`: 479 passed, zero failed, one skipped, across 32
  test files. The sole skip is the existing optional supplied 6,000-row workbook
  test: `FINSIGHT_WORKBOOK_PATH` is not set. No test or timeout is weakened.
- The full run includes 20 accepted-data adapter integration cases, 18 strict
  migration cases on PGlite and the same 18 on native PostgreSQL, existing C3-B1
  integration/concurrency/unknown-COMMIT tests, ingestion/analytics regressions
  and Jason's authorization/audit tests. Native tests ran, not skipped.
- The actual fixture flow stores one attempt, three batches, 23 accepted records
  (20 VALID and three WARNING), three warning issues, and no rejected financial
  records. All three rejected rows are counted separately; source context is kept.
- `pnpm typecheck` (Next route type generation plus TypeScript), `pnpm lint`, and
  `pnpm check:server-boundary` passed, preserving all security-module checks.
- `node supabase/tests/verify-local.mjs`,
  `node supabase/tests/verify-upgraded.mjs`, and
  `node tests/persistence/schema-compatibility.mjs` passed. Both current clean
  schema and populated historical migration paths are covered.
- All four published fixture sizes/hashes match the unchanged manifest in both
  working tree and Git index. The existing handoff evidence JSON is also exactly
  the main/index blob. The first full run exposed its Windows CRLF checkout
  conversion; preserving the committed LF bytes resolved that failure without
  regenerating evidence or editing Chia's tests, code, or contract.
- All SQL uses disposable local databases. The native suite creates its own
  loopback-only cluster and an additional disposable migration database. Hosted
  Supabase was not contacted. No dependency or lockfile changes were needed.

The completion report records the staged tree, clean-checkout results, exact
12-file Phase 4 diff, full pending-merge diff, protected-module comparisons and
final Git state. Prior personal results are not claimed as group execution.
