// src/lib/logger.ts
import pino, { type Logger, type LoggerOptions } from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const pretty = process.env.LOG_PRETTY === "true";

const options: LoggerOptions = {
  level,
  base: undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "token",
      "password",
      "*.token",
      "*.password",
    ],
    remove: true,
  },
};

export const logger: Logger = pino(
  options,
  pretty
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      })
    : undefined
);
