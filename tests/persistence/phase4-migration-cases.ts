import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

export interface MigrationDatabase {
  exec(sql: string): Promise<void>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}
const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const migration = read("supabase/sql/phase4-accepted-data-upgrade.sql");
const firstRecord = "'20000000-0000-4000-8000-000000000001'";
const ledger = `UPDATE public.financial_records SET monetary_basis='debit_credit',
  debit=9007199254740993.123456789, credit=0.000000001,
  derived_ledger_net=9007199254740993.123456788 WHERE id=${firstRecord}`;

/** Identical financial-integrity cases run on PGlite and a fresh native database. */
export function phase4MigrationCases(label: string, factory: () => Promise<MigrationDatabase>) {
  describe(label, () => {
    let db: MigrationDatabase;
    beforeAll(async () => { db = await factory(); }, 30000);
    beforeEach(async () => {
      // The factory must provide a disposable database owned exclusively by this suite.
      await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      await db.exec(`DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      END $$;`);
      for (const path of ["supabase/tests/fixtures/phase1-original-schema.sql", "supabase/seed.sql",
        "supabase/sql/phase1-source-file-upgrade.sql", "supabase/sql/c3b1-grouped-persistence-upgrade.sql"]) {
        await db.exec(read(path));
      }
    });
    afterAll(async () => { await db?.close(); });
    async function constraints() {
      return (await db.query(`SELECT oid::text, conname, pg_get_constraintdef(oid,false) AS definition,
        convalidated FROM pg_constraint WHERE conrelid='public.financial_records'::regclass ORDER BY conname`)).rows;
    }
    async function data() {
      return Promise.all(["ingestion_batches", "financial_records", "validation_issues", "persistence_attempts"]
        .map(async table => (await db.query(`SELECT row_to_json(t)::text AS row FROM public.${table} t ORDER BY id`)).rows));
    }
    async function refused() {
      const beforeConstraints = await constraints(), beforeData = await data();
      await expect(db.exec(migration)).rejects.toMatchObject({ code: "P0001", message: expect.stringContaining("Phase 4 migration refused:") });
      // A failed explicit migration transaction must be rolled back by its runner.
      await db.exec("ROLLBACK");
      expect(await constraints()).toEqual(beforeConstraints);
      expect(await data()).toEqual(beforeData);
    }
    it("replaces only the exact predecessor and preserves populated history and extra safeguards", async () => {
      await db.exec(ledger);
      await db.exec("ALTER TABLE public.financial_records ADD CONSTRAINT extra_financial_safeguard CHECK (balance IS NULL OR balance > -1000000)");
      const beforeData = await data(), before = await constraints();
      await db.exec(migration);
      expect(await data()).toEqual(beforeData);
      const after = await constraints();
      expect(after.filter(c => c.conname !== "financial_records_monetary_representation_check"))
        .toEqual(before.filter(c => c.conname !== "financial_records_check1"));
      expect(after.find(c => c.conname === "financial_records_monetary_representation_check"))?.toMatchObject({ convalidated: true });
      expect((await db.query(`SELECT debit::text,credit::text,derived_ledger_net::text,balance::text FROM public.financial_records WHERE id=${firstRecord}`)).rows[0])
        .toEqual({ debit: "9007199254740993.123456789", credit: "0.000000001", derived_ledger_net: "9007199254740993.123456788", balance: "123.4567890123456789" });
    });
    it("permits unavailable ledger net only with supplied debit and credit, without fabricating values", async () => {
      await db.exec(ledger);
      await expect(db.exec(`UPDATE public.financial_records SET derived_ledger_net=NULL WHERE id=${firstRecord}`)).rejects.toMatchObject({ code: "23514" });
      await db.exec(migration);
      await db.exec(`UPDATE public.financial_records SET derived_ledger_net=NULL WHERE id=${firstRecord}`);
      expect((await db.query(`SELECT debit::text,credit::text,derived_ledger_net,balance::text FROM public.financial_records WHERE id=${firstRecord}`)).rows[0])
        .toEqual({ debit: "9007199254740993.123456789", credit: "0.000000001", derived_ledger_net: null, balance: "123.4567890123456789" });
    });
    it.each([
      ["incorrect ledger result", "derived_ledger_net=1"],
      ["missing ledger debit", "debit=NULL,derived_ledger_net=NULL"],
      ["missing ledger credit", "credit=NULL,derived_ledger_net=NULL"],
      ["missing signed amount", "monetary_basis='source_signed_amount',source_amount=NULL,derived_ledger_net=NULL"],
      ["missing direction amount", "monetary_basis='source_amount_with_direction',source_amount=NULL,entry_side='DEBIT',derived_ledger_net=NULL"],
      ["derived value on a signed amount", "monetary_basis='source_signed_amount',derived_ledger_net=1"],
      ["derived value on amount/direction", "monetary_basis='source_amount_with_direction',source_amount=1,entry_side='DEBIT',derived_ledger_net=1"],
      ["nonfinite debit", "debit='NaN',derived_ledger_net=NULL"],
      ["nonfinite balance", "balance='Infinity'"],
    ])("rejects %s after migration", async (_label, assignments) => {
      await db.exec(ledger); await db.exec(migration);
      const before = await data();
      await expect(db.exec(`UPDATE public.financial_records SET ${assignments} WHERE id=${firstRecord}`)).rejects.toMatchObject({ code: "23514" });
      expect(await data()).toEqual(before);
    });
    it("refuses a modified predecessor without losing its additional restriction", async () => {
      await db.exec(`ALTER TABLE public.financial_records DROP CONSTRAINT financial_records_check1;
        ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_check1 CHECK (
          ((monetary_basis='debit_credit' AND debit IS NOT NULL AND credit IS NOT NULL
            AND derived_ledger_net IS NOT NULL AND derived_ledger_net=debit-credit)
          OR (monetary_basis IN ('source_signed_amount','source_amount_with_direction')
            AND source_amount IS NOT NULL AND derived_ledger_net IS NULL)) AND (balance IS NULL OR balance > 0));`);
      await refused();
    });
    it("refuses a renamed/missing predecessor rather than searching for similar constraints", async () => {
      await db.exec("ALTER TABLE public.financial_records RENAME CONSTRAINT financial_records_check1 TO teammate_monetary_safeguard");
      await refused();
    });
    it("refuses an unvalidated predecessor", async () => {
      const definition = (await constraints()).find(c => c.conname === "financial_records_check1")!.definition;
      await db.exec(`ALTER TABLE public.financial_records DROP CONSTRAINT financial_records_check1;
        ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_check1 ${definition} NOT VALID`);
      await refused();
    });
    it("is a schema/data no-op on repeated execution with the exact validated replacement", async () => {
      await db.exec(ledger); await db.exec(migration);
      const beforeConstraints = await constraints(), beforeData = await data();
      await db.exec(migration);
      expect(await constraints()).toEqual(beforeConstraints);
      expect(await data()).toEqual(beforeData);
    });
    it("refuses an unexpected replacement rather than treating it as already migrated", async () => {
      await db.exec(migration);
      await db.exec(`ALTER TABLE public.financial_records DROP CONSTRAINT financial_records_monetary_representation_check;
        ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_monetary_representation_check
        CHECK (source_amount IS NOT NULL OR derived_ledger_net IS NULL);`);
      await refused();
    });
    it("refuses an unvalidated replacement rather than silently accepting it", async () => {
      await db.exec(migration);
      const definition = (await constraints()).find(c => c.conname === "financial_records_monetary_representation_check")!.definition;
      await db.exec(`ALTER TABLE public.financial_records DROP CONSTRAINT financial_records_monetary_representation_check;
        ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_monetary_representation_check ${definition} NOT VALID`);
      await refused();
    });
    it("refuses simultaneous predecessor and replacement constraints", async () => {
      const definition = (await constraints()).find(c => c.conname === "financial_records_check1")!.definition;
      await db.exec(migration);
      await db.exec(`ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_check1 ${definition}`);
      await refused();
    });
  });
}
