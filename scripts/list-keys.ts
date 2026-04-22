/**
 * list-keys.ts — List all API keys with current month usage.
 *
 * Usage:
 *   npm run key:list
 */

import { closePool } from "../src/lib/pgClient.js";
import { listKeys } from "../src/providers/apiKeyStore.js";
import { logger } from "../src/lib/logger.js";

async function main(): Promise<void> {
  const keys = await listKeys();
  if (keys.length === 0) {
    console.log("No API keys found.");
    return;
  }

  console.log("");
  console.log(
    "LABEL".padEnd(24) +
      "HASH".padEnd(20) +
      "CREATED".padEnd(12) +
      "STATUS".padEnd(12) +
      "RPM".padEnd(6) +
      "QUOTA".padEnd(10) +
      "USED"
  );
  console.log("-".repeat(90));
  for (const k of keys) {
    const status = k.revokedAt
      ? "revoked"
      : k.expiresAt && k.expiresAt < new Date()
        ? "expired"
        : "active";
    console.log(
      k.label.slice(0, 22).padEnd(24) +
        k.keyHashPreview.padEnd(20) +
        k.createdAt.toISOString().slice(0, 10).padEnd(12) +
        status.padEnd(12) +
        String(k.rateLimitPerMinute).padEnd(6) +
        String(k.monthlyQuota).padEnd(10) +
        String(k.monthlyUsage)
    );
  }
  console.log("");
}

main()
  .catch((err) => {
    logger.error({ err }, "Failed to list keys");
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
