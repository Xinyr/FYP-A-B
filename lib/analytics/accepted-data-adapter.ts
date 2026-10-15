import {
  aggregateCanonicalRecords,
  detectRobustAmountAnomalies,
  prepareAcceptedRecords,
  SUPPORTED_ANALYTICS_RULESET_VERSION,
  SUPPORTED_ANALYTICS_SCHEMA_VERSION,
  type AnalyticsRun,
  type WarningPolicy,
} from "./index";
import type { CanonicalTransaction } from "../ingestion/models";

export type AcceptedRecordPayload = Omit<
  CanonicalTransaction,
  | "source_system"
  | "source_file"
  | "source_sheet"
  | "file_sha256"
  | "ingestion_batch_id"
  | "ingested_at"
  | "derived_ledger_net"
>;

export interface AcceptedDatasetPayload {
  dataset_id: string;
  schema_version: string;
  ruleset_version: string;
  file: { name: string; sha256: string };
  sheet: string | null;
  options: { sourceSystem: string };
  context: { batchId: string; ingestedAt: string };
  normalized: readonly AcceptedRecordPayload[];
}

export interface AcceptedDataPayload {
  schema_version: string;
  ruleset_version: string;
  datasets: readonly AcceptedDatasetPayload[];
}

interface ParsedDecimal {
  units: bigint;
  scale: number;
}

function parseDecimal(value: string): ParsedDecimal {
  const normalized = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error(`Invalid canonical decimal string: ${value}`);
  }

  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^[+-]/, "");
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const digits = `${whole || "0"}${fraction}`;
  const units = BigInt(digits || "0") * (negative ? -1n : 1n);
  return { units, scale: fraction.length };
}

function formatDecimal(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units)
    .toString()
    .padStart(scale + 1, "0");
  if (scale === 0) return `${negative ? "-" : ""}${digits}`;

  const whole = digits.slice(0, -scale) || "0";
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Exact debit-minus-credit calculation; a missing side is not assumed zero. */
function deriveLedgerNet(
  debit: string | null,
  credit: string | null,
): string | null {
  if (debit === null || credit === null) return null;

  const parsedDebit = parseDecimal(debit);
  const parsedCredit = parseDecimal(credit);
  const scale = Math.max(parsedDebit.scale, parsedCredit.scale);
  const debitUnits =
    parsedDebit.units * 10n ** BigInt(scale - parsedDebit.scale);
  const creditUnits =
    parsedCredit.units * 10n ** BigInt(scale - parsedCredit.scale);
  return formatDecimal(debitUnits - creditUnits, scale);
}

function assertVersion(
  actual: string,
  expected: string,
  field: "schema_version" | "ruleset_version",
  context: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `Unsupported ${field} in ${context}: ${actual}. Analytics supports ${expected}.`,
    );
  }
}

function restoreCanonicalRecord(
  dataset: AcceptedDatasetPayload,
  record: AcceptedRecordPayload,
): CanonicalTransaction {
  const ledgerNet =
    record.monetary_basis === "debit_credit"
      ? deriveLedgerNet(record.debit, record.credit)
      : null;

  return {
    ...record,
    source_system: dataset.options.sourceSystem,
    source_file: dataset.file.name,
    source_sheet: dataset.sheet,
    file_sha256: dataset.file.sha256,
    ingestion_batch_id: dataset.context.batchId,
    ingested_at: dataset.context.ingestedAt,
    derived_ledger_net: ledgerNet,
  };
}

/**
 * Consume C1's reduced accepted-data payload without replacing the existing
 * IngestionResult[] adapter. This trusts producer-created records and is not a
 * full runtime validator for arbitrary JSON.
 */
export function analyzeAcceptedDataPayload(
  payload: AcceptedDataPayload,
  warningPolicy: WarningPolicy = "include",
): AnalyticsRun {
  assertVersion(
    payload.schema_version,
    SUPPORTED_ANALYTICS_SCHEMA_VERSION,
    "schema_version",
    "payload",
  );
  assertVersion(
    payload.ruleset_version,
    SUPPORTED_ANALYTICS_RULESET_VERSION,
    "ruleset_version",
    "payload",
  );

  // Preflight every dataset before mapping any record or performing analysis.
  for (const [index, dataset] of payload.datasets.entries()) {
    const context = `dataset ${dataset.dataset_id || index}`;
    assertVersion(
      dataset.schema_version,
      SUPPORTED_ANALYTICS_SCHEMA_VERSION,
      "schema_version",
      context,
    );
    assertVersion(
      dataset.ruleset_version,
      SUPPORTED_ANALYTICS_RULESET_VERSION,
      "ruleset_version",
      context,
    );
    if (
      !dataset.file?.name ||
      !dataset.file?.sha256 ||
      !dataset.options?.sourceSystem ||
      !dataset.context?.batchId ||
      !dataset.context?.ingestedAt
    ) {
      throw new Error(`Missing required provenance metadata in ${context}.`);
    }
  }

  const normalized = payload.datasets.flatMap((dataset) =>
    dataset.normalized.map((record) => restoreCanonicalRecord(dataset, record)),
  );

  for (const record of normalized) {
    if (
      record.ingestion_status !== "VALID" &&
      record.ingestion_status !== "WARNING"
    ) {
      throw new Error(
        `Unexpected accepted-record status: ${String(record.ingestion_status)}.`,
      );
    }
  }

  const prepared = prepareAcceptedRecords(
    {
      schema_version: payload.schema_version,
      ruleset_version: payload.ruleset_version,
      normalized,
    },
    warningPolicy,
  );
  return {
    schema_version: payload.schema_version,
    ruleset_version: payload.ruleset_version,
    prepared,
    monthlyAggregates: aggregateCanonicalRecords(prepared.records),
    anomalies: detectRobustAmountAnomalies(prepared.records),
  };
}
