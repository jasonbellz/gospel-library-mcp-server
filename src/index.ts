/**
 * Gospel Library MCP Server — entrypoint.
 *
 * Dispatches to the HTTP server or the reindex job based on the first CLI
 * argument or the MODE env var.
 */

import { config } from "./config.js";
import { logger } from "./lib/logger.js";

async function main(): Promise<void> {
  const cliMode = process.argv[2];
  const mode = (cliMode === "reindex" || cliMode === "server" ? cliMode : config.mode) as
    | "server"
    | "reindex";

  if (mode === "reindex") {
    const { runReindex } = await import("./jobs/reindex.js");
    await runReindex();
    return;
  }

  const { startServer } = await import("./server.js");
  await startServer();
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal error");
  process.exit(1);
});
