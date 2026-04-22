/**
 * logger.ts — Structured JSON logging via pino.
 *
 * Container Apps captures stdout into Log Analytics, so all logs go to stdout
 * as single-line JSON. Use `pino-pretty` only when LOG_PRETTY=1 (local dev).
 */

import pino from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const pretty = process.env.LOG_PRETTY === "1";

export const logger = pino({
  level,
  base: { service: "gospel-library-mcp-server" },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
});

export type Logger = typeof logger;
