import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug");

export const logger = pino({
  level: logLevel,
  base: {
    service: "repo-server",
    env: process.env.NODE_ENV ?? "development"
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          singleLine: true
        }
      }
});

export interface RequestLogContext {
  requestId?: string;
}

export function withRequestLogger(context?: RequestLogContext): pino.Logger {
  if (!context?.requestId) {
    return logger;
  }
  return logger.child({ requestId: context.requestId });
}
