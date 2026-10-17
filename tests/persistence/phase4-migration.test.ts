import { PGlite } from "@electric-sql/pglite";
import { phase4MigrationCases } from "./phase4-migration-cases";

phase4MigrationCases("PGlite: strict Phase 4 monetary migration", async () => {
  const db = await PGlite.create();
  return { exec: async sql => { await db.exec(sql); }, query: sql => db.query(sql), close: () => db.close() };
});
