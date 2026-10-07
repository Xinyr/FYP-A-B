import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["supabase/.verification-runtime/**", "supabase/.temp/**", "coverage/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  // Existing reader safety checks intentionally match filename controls/ZIP bytes.
  { files: ["lib/ingestion/readers.ts"], rules: { "no-control-regex": "off" } },
  // Preserve Chia's existing fixture regex bytes during a tooling-only cleanup.
  { files: ["tests/ingestion/xlsx-fixtures.test.ts"], rules: { "no-useless-escape": "off" } },
  // Surface the existing release-error behavior without changing approved Phase 2.
  { files: ["lib/server/db/postgres.ts"], rules: { "no-unsafe-finally": "warn" } },
]);
