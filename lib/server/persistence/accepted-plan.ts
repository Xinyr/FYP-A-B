import "server-only";
import type { AcceptedDataPayload } from "../../ingestion/accepted-data";
import { PersistenceError, SUPPORTED_PERSISTENCE_VERSIONS, type PersistencePlan } from "./contracts";
import { requireInput, persistenceValidation as v } from "./validate";
import { validateSourceFile } from "./source-file";
import { mapRecord } from "./map";

export interface GroupedChild {
  plan: PersistencePlan;
  metadata: object;
}

/** Validate the actual reduced C1 transport, without inventing excluded engine evidence. */
export function prepareAcceptedGroup(value: unknown): GroupedChild[] {
  try {
    const payload = v.object(value);
    for (const key of ["schema_version", "ruleset_version"] as const) {
      requireInput(typeof payload[key] === "string");
      if (payload[key] !== SUPPORTED_PERSISTENCE_VERSIONS[key]) throw new PersistenceError("UNSUPPORTED_VERSION");
    }
    const datasets = v.array(payload.datasets);
    requireInput(datasets.length > 0);
    const seen = new Set<string>();
    return datasets.map(value => {
      const input = v.object(value);
      const source_file = validateSourceFile(input.source_file);
      const dataset_id = v.text(input.dataset_id), hash = v.text(input.file_sha256);
      requireInput(/^[0-9a-f]{64}$/.test(hash));
      const suffix = dataset_id.slice(hash.length + 1);
      requireInput(dataset_id.startsWith(hash + ":") && /^(0|[1-9]\d*)$/.test(suffix));
      const sheetIndex = v.integer(Number(suffix));
      const ingestion_batch_id = v.text(input.ingestion_batch_id);
      const source_system = v.text(input.source_system);
      requireInput(ingestion_batch_id.trim().length > 0 && source_system === source_system.trim());
      const source_sheet = v.nullableText(input.source_sheet), ingested_at = v.timestamp(input.ingested_at);
      const identity = JSON.stringify([ingestion_batch_id, source_file, dataset_id]);
      requireInput(!seen.has(identity)); seen.add(identity);
      const context = { batchId: ingestion_batch_id, ingestedAt: ingested_at, hash,
        file: source_file, sheet: source_sheet, sheetIndex, sourceSystem: source_system };
      const coordinates = new Set<number>();
      const records = v.array(input.normalized).map(value => {
        const row = v.object(value);
        // C1 excludes these fields. Refuse contradictory extra provenance/evidence.
        for (const key of ["derived_ledger_net", "source_system", "source_file", "source_sheet", "file_sha256", "ingestion_batch_id", "ingested_at"]) {
          requireInput(!Object.hasOwn(row, key));
        }
        const record = v.canonical({ ...row, source_system, source_file, source_sheet, file_sha256: hash,
          ingestion_batch_id, ingested_at, derived_ledger_net: null }, context, true);
        requireInput(!coordinates.has(record.source_row_number)); coordinates.add(record.source_row_number);
        return record;
      });
      const summary = v.object(input.summary);
      const counts = { rowsReceived: v.integer(summary.rowsReceived), accepted: v.integer(summary.accepted),
        valid: v.integer(summary.valid), warning: v.integer(summary.warning), rejected: v.integer(summary.rejected),
        duplicateRows: v.integer(summary.duplicateRows), requiredCompleteness: summary.requiredCompleteness };
      requireInput(counts.requiredCompleteness === null || (typeof counts.requiredCompleteness === "number"
        && Number.isFinite(counts.requiredCompleteness) && counts.requiredCompleteness >= 0 && counts.requiredCompleteness <= 100));
      requireInput(counts.accepted === records.length && counts.valid === records.filter(r => r.ingestion_status === "VALID").length
        && counts.warning === records.filter(r => r.ingestion_status === "WARNING").length
        && counts.rowsReceived === counts.accepted + counts.rejected && counts.duplicateRows <= counts.rowsReceived);
      // Compile-time link to the confirmed producer summary, without casting external input.
      const producerSummary: AcceptedDataPayload["datasets"][number]["summary"] = {
        ...counts, requiredCompleteness: counts.requiredCompleteness,
      };
      return {
        plan: { kind: "PREPARED", batch: { source_file, ingestion_batch_id, ...SUPPORTED_PERSISTENCE_VERSIONS,
          rows_received: counts.rowsReceived, valid_count: counts.valid, warning_count: counts.warning, rejected_count: counts.rejected },
        datasets: [{ dataset_id, records: records.map(mapRecord) }] },
        metadata: { input_contract: "C1_ACCEPTED_DATA_0.1", summary: producerSummary,
          summary_evidence: "PRODUCER_DECLARED_COUNTS_ACCEPTED_CHECKED", source_system, source_file, source_sheet,
          file_sha256: hash, ingestion_batch_id, ingested_at, ledger_net: "NOT_SUPPLIED" },
      };
    });
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError("INVALID_INPUT");
  }
}
