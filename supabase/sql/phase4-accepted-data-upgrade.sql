-- LOCAL TESTING ONLY until separately approved for hosted SQL Editor deployment.
-- C1 omits ledger interpretation. Keep source debit/credit, allowing an unavailable
-- derived value; any supplied derived value must still equal debit minus credit.
-- NULL means unavailable, never zero. No source or calculated values are filled in.
-- Idempotent only for an exact, validated replacement with no predecessor left.
BEGIN;
LOCK TABLE public.financial_records IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE
  predecessor record;
  replacement record;
  expected_predecessor text;
  expected_replacement text;
BEGIN
  -- Let this PostgreSQL version parse/deparse the two exact expected definitions.
  -- This avoids a version-specific deparser fingerprint or permissive substrings.
  CREATE TEMP TABLE phase4_expected_monetary_constraints (
    monetary_basis text, debit numeric, credit numeric,
    derived_ledger_net numeric, source_amount numeric,
    CONSTRAINT expected_predecessor CHECK (
      (monetary_basis = 'debit_credit' AND debit IS NOT NULL AND credit IS NOT NULL
       AND derived_ledger_net IS NOT NULL AND derived_ledger_net = debit - credit)
      OR (monetary_basis IN ('source_signed_amount','source_amount_with_direction')
          AND source_amount IS NOT NULL AND derived_ledger_net IS NULL)),
    CONSTRAINT expected_replacement CHECK (
      (monetary_basis = 'debit_credit' AND debit IS NOT NULL AND credit IS NOT NULL
       AND (derived_ledger_net IS NULL OR derived_ledger_net = debit - credit))
      OR (monetary_basis IN ('source_signed_amount','source_amount_with_direction')
          AND source_amount IS NOT NULL AND derived_ledger_net IS NULL))
  ) ON COMMIT DROP;
  SELECT pg_get_constraintdef(oid, false) INTO STRICT expected_predecessor
    FROM pg_constraint WHERE conrelid = 'pg_temp.phase4_expected_monetary_constraints'::regclass
    AND conname = 'expected_predecessor';
  SELECT pg_get_constraintdef(oid, false) INTO STRICT expected_replacement
    FROM pg_constraint WHERE conrelid = 'pg_temp.phase4_expected_monetary_constraints'::regclass
    AND conname = 'expected_replacement';

  SELECT contype, convalidated, connoinherit, pg_get_constraintdef(oid, false) AS definition
    INTO predecessor FROM pg_constraint
    WHERE conrelid = 'public.financial_records'::regclass AND conname = 'financial_records_check1';
  SELECT contype, convalidated, connoinherit, pg_get_constraintdef(oid, false) AS definition
    INTO replacement FROM pg_constraint
    WHERE conrelid = 'public.financial_records'::regclass
      AND conname = 'financial_records_monetary_representation_check';

  IF replacement.contype IS NOT NULL THEN
    IF predecessor.contype IS NOT NULL OR replacement.contype <> 'c'
       OR NOT replacement.convalidated OR replacement.connoinherit
       OR replacement.definition IS DISTINCT FROM expected_replacement THEN
      RAISE EXCEPTION 'Phase 4 migration refused: unexpected replacement constraint or predecessor still present';
    END IF;
    RETURN; -- Exact replacement already installed: no persistent schema/data changes.
  END IF;
  IF predecessor.contype IS DISTINCT FROM 'c' OR NOT predecessor.convalidated
     OR predecessor.connoinherit OR predecessor.definition IS DISTINCT FROM expected_predecessor THEN
    RAISE EXCEPTION 'Phase 4 migration refused: expected validated C3-B1 monetary constraint differs or is missing';
  END IF;
  -- All other constraints, including additional team safeguards, remain untouched.
  ALTER TABLE public.financial_records DROP CONSTRAINT financial_records_check1;
  ALTER TABLE public.financial_records ADD CONSTRAINT financial_records_monetary_representation_check
    CHECK ((monetary_basis = 'debit_credit' AND debit IS NOT NULL AND credit IS NOT NULL
            AND (derived_ledger_net IS NULL OR derived_ledger_net = debit - credit))
        OR (monetary_basis IN ('source_signed_amount','source_amount_with_direction')
            AND source_amount IS NOT NULL AND derived_ledger_net IS NULL));
END $$;
COMMIT;
