/**
 * issue-key.ts — Issue a new API key.
 *
 * Usage:
 *   npm run key:issue -- --label "acme-prod" [--rpm 120] [--quota 50000] [--expires 2026-01-01]
 *
 * Prints the raw key ONCE to stdout; only its sha256 hash is stored.
 */

import { parseArgs } from "node:util";
import { closePool } from "../src/lib/pgClient.js";
import { issueKey } from "../src/providers/apiKeyStore.js";
import { logger } from "../src/lib/logger.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      label: { type: "string" },
      rpm: { type: "string" },
      quota: { type: "string" },
      expires: { type: "string" },
    },
  });

  if (!values.label) {
    console.error("Error: --label is required");
    process.exit(1);
  }

  const result = await issueKey({
    label: values.label,
    rateLimitPerMinute: values.rpm ? parseInt(values.rpm, 10) : undefined,
    monthlyQuota: values.quota ? parseInt(values.quota, 10) : undefined,
    expiresAt: values.expires ? new Date(values.expires) : undefined,
  });

  console.log("");
  console.log("  API key issued successfully.");
  console.log("  Label:   ", result.label);
  console.log("  Key hash:", result.keyHash);
  console.log("");
  console.log("  RAW KEY (store this securely — it will not be shown again):");
  console.log("");
  console.log("    " + result.rawKey);
  console.log("");
}

main()
  .catch((err) => {
    logger.error({ err }, "Failed to issue key");
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
