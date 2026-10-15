import { describe, expect, it } from "vitest";
import {
  analyzeAcceptedDataPayload,
  type AcceptedDataPayload,
  type AcceptedRecordPayload,
} from "../lib/analytics/accepted-data-adapter";

function record(overrides: Partial<AcceptedRecordPayload> = {}): AcceptedRecordPayload {
  return {
    source_row_number: 2, source_row_id: "sha:0:2",
    transaction_date: "2026-09-01", posting_date: null,
    canonical_date: "2026-09-01", canonical_date_basis: "TRANSACTION_DATE",
    reference: "REF-1", source_transaction_id: null, account_code: "00100",
    account_id: null, entity_id: null, description: "Synthetic transaction",
    counterparty: null, debit: "10.10", credit: "0.10", source_amount: null,
    balance: null, entry_side: "DEBIT", monetary_basis: "debit_credit",
    currency: "MYR", currency_basis: "SOURCE", transformations: [],
    ingestion_status: "VALID", validation_messages: [], ...overrides,
  };
}

function payload(records: AcceptedRecordPayload[] = [record()]): AcceptedDataPayload {
  return {
    schema_version: "0.1", ruleset_version: "0.1",
    datasets: [{
      dataset_id: "sha:0", schema_version: "0.1", ruleset_version: "0.1",
      file: { name: "ledger.csv", sha256: "a".repeat(64) }, sheet: null,
      options: { sourceSystem: "Ledger" },
      context: { batchId: "batch-1", ingestedAt: "2026-10-02T00:00:00.000Z" },
      normalized: records,
    }],
  };
}

describe("C1 accepted-data analytics adapter", () => {
  it("reconstructs dataset provenance and derives ledger net exactly", () => {
    const result = analyzeAcceptedDataPayload(payload([
      record({ debit: "9007199254740993.10", credit: "0.10" }),
    ]));
    expect(result.prepared.records[0]).toMatchObject({
      source_system: "Ledger", source_file: "ledger.csv", source_sheet: null,
      file_sha256: "a".repeat(64), ingestion_batch_id: "batch-1",
      ingested_at: "2026-10-02T00:00:00.000Z", derived_ledger_net: "9007199254740993",
    });
  });

  it("does not derive ledger net for bank/source-amount records", () => {
    const result = analyzeAcceptedDataPayload(payload([
      record({ monetary_basis: "source_amount_with_direction", source_amount: "12.30", debit: null, credit: null }),
    ]));
    expect(result.prepared.records[0].derived_ledger_net).toBeNull();
  });

  it("does not assume a missing debit or credit is zero", () => {
    const result = analyzeAcceptedDataPayload(payload([record({ credit: null })]));
    expect(result.prepared.records[0].derived_ledger_net).toBeNull();
  });

  it("applies warning policy and retains excluded warning records", () => {
    const result = analyzeAcceptedDataPayload(payload([
      record(), record({ source_row_number: 3, source_row_id: "sha:0:3", ingestion_status: "WARNING" }),
    ]), "exclude");
    expect(result.prepared.counts).toMatchObject({ received: 2, included: 1, warning: 1, excludedWarnings: 1 });
    expect(result.prepared.excludedWarningRecords[0].source_row_id).toBe("sha:0:3");
  });

  it("rejects incompatible dataset versions", () => {
    const input = payload();
    input.datasets[0].schema_version = "0.2";
    expect(() => analyzeAcceptedDataPayload(input)).toThrow(/Unsupported schema_version/);
  });

  it("rejects missing provenance instead of fabricating it", () => {
    const input = payload();
    input.datasets[0].file.name = "";
    expect(() => analyzeAcceptedDataPayload(input)).toThrow(/Missing required provenance/);
  });

  it("rejects unexpected record statuses", () => {
    const invalid = { ...record(), ingestion_status: "REJECTED" } as unknown as AcceptedRecordPayload;
    expect(() => analyzeAcceptedDataPayload(payload([invalid]))).toThrow(/Unexpected accepted-record status/);
  });
});
