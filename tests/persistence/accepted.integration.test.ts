import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createAcceptedDataPayload } from "../../lib/ingestion";
import { createGroupedPersistenceService } from "../../lib/server/persistence/grouped";
import { PersistenceError } from "../../lib/server/persistence/contracts";
import type { TransactionDatabase } from "../../lib/server/db/postgres";
import { consultationResults } from "../integration/fixtures";
import { syntheticResult, header } from "./fixtures";

let db: PGlite, transactions = 0;
const database: TransactionDatabase = {
  close: async () => {},
  async transaction(work) {
    transactions++;
    return db.transaction(tx => work({ async query<Row extends Record<string, unknown>>(sql: string, values?: unknown[]) {
      const result = await tx.query<Row>(sql, values);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    } }));
  },
};
const service = createGroupedPersistenceService(database);
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  for (const path of ["phase1-clean-setup.sql", "c3b1-grouped-persistence-upgrade.sql", "phase4-accepted-data-upgrade.sql"]) {
    await db.exec(readFileSync(new URL("../../supabase/sql/" + path, import.meta.url), "utf8"));
  }
}, 30000);
beforeEach(async () => {
  await db.exec("TRUNCATE public.validation_issues, public.financial_records, public.ingestion_batches, public.persistence_attempts;");
  transactions = 0;
});
afterAll(async () => { await db?.close(); });
async function counts() {
  return (await db.query("SELECT (SELECT count(*)::int FROM public.persistence_attempts) attempts, (SELECT count(*)::int FROM public.ingestion_batches) batches, (SELECT count(*)::int FROM public.financial_records) records, (SELECT count(*)::int FROM public.validation_issues) issues")).rows[0];
}
describe("internal C1/C2 accepted transport to grouped persistence", () => {
  it("persists the exact published CSV/XLSX outputs, counts, warnings and lineage atomically", async () => {
    const results = await consultationResults(), payload = createAcceptedDataPayload(results), snapshot = structuredClone(payload);
    const attempt_id = randomUUID();
    const receipt = await service.persistAcceptedAttempt({ attempt_id, payload });
    expect(transactions).toBe(1);
    expect(await counts()).toEqual({ attempts: 1, batches: 3, records: 23, issues: 3 });
    for (const [index, dataset] of payload.datasets.entries()) {
      const child = receipt.datasets[index];
      expect(child).toMatchObject({ dataset_id: dataset.dataset_id, ingestion_batch_id: dataset.ingestion_batch_id,
        source_file: dataset.source_file, accepted_record_count: dataset.normalized.length });
      const batch = (await db.query("SELECT * FROM public.ingestion_batches WHERE id=$1", [child.batch_id])).rows[0];
      expect(batch).toMatchObject({ persistence_attempt_id: attempt_id, dataset_id: dataset.dataset_id,
        rows_received: dataset.summary.rowsReceived, valid_count: dataset.summary.valid,
        warning_count: dataset.summary.warning, rejected_count: dataset.summary.rejected,
        context: { summary: dataset.summary } });
      const rows = (await db.query<Record<string, unknown>>("SELECT *, transaction_date::text AS transaction_date, posting_date::text AS posting_date, canonical_date::text AS canonical_date FROM public.financial_records WHERE batch_id=$1 ORDER BY source_row_number", [child.batch_id])).rows;
      for (const [rowIndex, accepted] of dataset.normalized.entries()) {
        const { validation_messages, ...fields } = accepted;
        expect(rows[rowIndex]).toMatchObject({ ...fields, source_file: dataset.source_file, source_sheet: dataset.source_sheet,
          file_sha256: dataset.file_sha256, ingestion_batch_id: dataset.ingestion_batch_id, source_system: dataset.source_system,
          derived_ledger_net: null });
        const issues = (await db.query("SELECT * FROM public.validation_issues WHERE financial_record_id=$1 ORDER BY issue_ordinal", [rows[rowIndex].id])).rows;
        expect(issues).toHaveLength(validation_messages.length);
        validation_messages.forEach((issue, ordinal) => expect(issues[ordinal]).toMatchObject({
          issue_ordinal: ordinal, rule: issue.rule, category: issue.category, severity: issue.severity,
          field: issue.field, source_column: issue.sourceColumn, original_value: issue.originalValue, message: issue.message,
        }));
      }
    }
    const rejected = results.flatMap(r => r.records.filter(row => row.status === "REJECTED").map(row => row.provenance.source_row_id));
    expect(rejected).toHaveLength(3);
    expect((await db.query("SELECT source_row_id FROM public.financial_records WHERE source_row_id = ANY($1::text[])", [rejected])).rows).toEqual([]);
    expect(payload).toEqual(snapshot);
  });
  it("keeps exact high-precision decimals, identifiers and independent dates", async () => {
    const payload = createAcceptedDataPayload([await syntheticResult()]);
    await service.persistAcceptedAttempt({ attempt_id: randomUUID(), payload });
    expect((await db.query("SELECT source_amount::text, reference, transaction_date::text, posting_date::text FROM public.financial_records")).rows[0])
      .toEqual({ source_amount: "9007199254740993.123456789", reference: "00017", transaction_date: "2026-09-01", posting_date: "2026-09-03" });
  });
  it("retains all-rejected and genuinely zero-row datasets as COMPLETED_EMPTY", async () => {
    const empty = await syntheticResult(`${header}\ninvalid,2026-09-03,nope,R,ID,A,B,C,Synthetic,MYR`);
    const payload = createAcceptedDataPayload([empty]);
    const zero = structuredClone(payload.datasets[0]);
    zero.ingestion_batch_id = "zero-row-producer";
    Object.assign(zero.summary, { rowsReceived: 0, accepted: 0, valid: 0, warning: 0, rejected: 0, duplicateRows: 0, requiredCompleteness: null });
    payload.datasets.push(zero);
    const receipt = await service.persistAcceptedAttempt({ attempt_id: randomUUID(), payload });
    expect(receipt.datasets.map(d => d.status)).toEqual(["COMPLETED_EMPTY", "COMPLETED_EMPTY"]);
    expect(await counts()).toEqual({ attempts: 1, batches: 2, records: 0, issues: 0 });
    expect((await db.query("SELECT rejected_count FROM public.ingestion_batches ORDER BY ingestion_batch_id")).rows).toEqual([{ rejected_count: 1 }, { rejected_count: 0 }]);
  });
  it.each(["duplicate dataset", "rejected status", "rejected issue", "count mismatch", "lineage mismatch", "duplicate row", "decimal number", "bad filename", "missing field", "invalid date", "invalid summary"])("rejects %s before BEGIN", async kind => {
    const payload = createAcceptedDataPayload(await consultationResults());
    const dataset = payload.datasets[2], row = dataset.normalized[0];
    switch (kind) {
      case "duplicate dataset": payload.datasets.push(structuredClone(dataset)); break;
      case "rejected status": Object.assign(row, { ingestion_status: "REJECTED" }); break;
      case "rejected issue": Object.assign(dataset.normalized.find(r => r.validation_messages.length)!.validation_messages[0], { severity: "REJECTED" }); break;
      case "count mismatch": dataset.summary.rejected++; break;
      case "lineage mismatch": row.source_row_id = "unrelated:2"; break;
      case "duplicate row": dataset.normalized.push(structuredClone(row)); break;
      case "decimal number": Object.assign(row, { source_amount: 0.1 }); break;
      case "bad filename": dataset.source_file = "C:\\secret.csv"; break;
      case "missing field": Reflect.deleteProperty(row, "currency_basis"); break;
      case "invalid date": row.canonical_date = "2026-02-30"; break;
      case "invalid summary": dataset.summary.requiredCompleteness = NaN; break;
    }
    await expect(service.persistAcceptedAttempt({ attempt_id: randomUUID(), payload })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(transactions).toBe(0);
    expect(await counts()).toEqual({ attempts: 0, batches: 0, records: 0, issues: 0 });
  });
  it("version-gates before row access and refuses no-dataset submissions", async () => {
    await expect(service.persistAcceptedAttempt({ attempt_id: randomUUID(), payload: { schema_version: "9", ruleset_version: "0.1",
      get datasets() { throw new Error("must not execute"); } } })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(service.persistAcceptedAttempt({ attempt_id: randomUUID(), payload: { schema_version: "9", ruleset_version: "0.1", datasets: [] } })).rejects.toMatchObject({ code: "UNSUPPORTED_VERSION" });
    await expect(service.persistAcceptedAttempt({ attempt_id: randomUUID(), payload: createAcceptedDataPayload([]) })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(transactions).toBe(0);
  });
  it("rolls back earlier datasets on a later database failure", async () => {
    await db.exec(`CREATE FUNCTION pg_temp.fail_second() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.source_file = 'bank_statement.xlsx' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_failure BEFORE INSERT ON public.ingestion_batches FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_second();`);
    try {
      await expect(service.persistAcceptedAttempt({ attempt_id: randomUUID(), payload: createAcceptedDataPayload(await consultationResults()) })).rejects.toMatchObject({ code: "PERSISTENCE_FAILED" });
      expect(transactions).toBe(1);
      expect(await counts()).toEqual({ attempts: 0, batches: 0, records: 0, issues: 0 });
    } finally { await db.exec("DROP TRIGGER synthetic_failure ON public.ingestion_batches"); }
  });
  it("rejects duplicate attempts and preserves independent producer batches", async () => {
    const payload = createAcceptedDataPayload([await syntheticResult()]);
    const other = structuredClone(payload.datasets[0]); other.ingestion_batch_id = "independent"; payload.datasets.push(other);
    const attempt_id = randomUUID();
    const receipt = await service.persistAcceptedAttempt({ attempt_id, payload });
    expect(receipt.datasets.map(d => d.ingestion_batch_id)).toEqual(payload.datasets.map(d => d.ingestion_batch_id));
    await expect(service.persistAcceptedAttempt({ attempt_id, payload })).rejects.toMatchObject({ code: "IDEMPOTENCY_UNSUPPORTED" });
    expect(await counts()).toEqual({ attempts: 1, batches: 2, records: 2, issues: 0 });
  });
  it.each(["COMMIT_OUTCOME_UNKNOWN", "ROLLBACK_UNCONFIRMED"] as const)("preserves %s without retry", async code => {
    const uncertain: TransactionDatabase = { close: async () => {}, async transaction(work) {
      await database.transaction(work); throw new PersistenceError(code);
    } };
    const attempt_id = randomUUID();
    await expect(createGroupedPersistenceService(uncertain).persistAcceptedAttempt({ attempt_id,
      payload: createAcceptedDataPayload([await syntheticResult()]) })).rejects.toMatchObject({ code });
    expect(transactions).toBe(1);
    expect(await service.investigateAttempt(attempt_id)).toMatchObject({ attempt_id, outcome: "CONFIRMED_COMMITTED" });
  });
  it("keeps legacy full-engine persistence working after the additive migration", async () => {
    const results = await consultationResults();
    await service.persistGroupedAttempt({ attempt_id: randomUUID(), results });
    expect(await counts()).toEqual({ attempts: 1, batches: 3, records: 23, issues: 3 });
    expect((await db.query("SELECT count(*)::int n FROM public.financial_records WHERE monetary_basis='debit_credit' AND derived_ledger_net IS NOT NULL")).rows[0]).toEqual({ n: 10 });
  });
});
