/**
 * revoke-key.ts — Revoke an API key by label or hash.
 *
 * Usage:
 *   npm run key:revoke -- --id "acme-prod"
 */

import { parseArgs } from "node:util";
import { closePool } from "../src/lib/pgClient.js";
import { revokeKey } from "../src/providers/apiKeyStore.js";
import { logger } from "../src/lib/logger.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { id: { type: "string" } },
  });

  if (!values.id) {
    console.error("Error: --id (label or key hash) is required");
    process.exit(1);
  }

  const count = await revokeKey(values.id);
  if (count === 0) {
    console.log(`No active key found for "${values.id}"`);
  } else {
    console.log(`Revoked ${count} key(s) matching "${values.id}"`);
  }
}

main()
  .catch((err) => {
    logger.error({ err }, "Failed to revoke key");
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
