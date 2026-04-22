/**
 * apply-schema.ts — Apply the Postgres schema (infra/schema.sql).
 *
 * Run from a machine with network access to Postgres and an Entra identity
 * that is a Postgres admin (either the Container App's MI or your user UPN).
 *
 *   npm run schema:apply
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { closePool, getPool } from "../src/lib/pgClient.js";
import { logger } from "../src/lib/logger.js";

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sqlPath = path.resolve(here, "..", "infra", "schema.sql");
  const sql = await readFile(sqlPath, "utf-8");

  logger.info({ sqlPath }, "Applying schema");
  const pool = await getPool();
  await pool.query(sql);
  logger.info("Schema applied successfully");
}

main()
  .catch((err) => {
    logger.error({ err }, "Failed to apply schema");
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
