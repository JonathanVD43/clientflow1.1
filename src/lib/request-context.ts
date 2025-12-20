// src/lib/request-context.ts
import type { NextRequest } from "next/server";
import type { Logger } from "pino";
import { logger } from "@/lib/logger";

export type RequestContext = {
  reqId: string;
  log: Logger;
};

function newReqId(): string {
  // Available in modern Node & Edge
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}_${Math.random()}`;
}

export function getRequestContext(req: NextRequest): RequestContext {
  const existing =
    req.headers.get("x-request-id") ||
    req.headers.get("x-correlation-id") ||
    req.headers.get("x-amzn-trace-id");

  const reqId = existing ?? newReqId();

  const log = logger.child({
    reqId,
    method: req.method,
    path: req.nextUrl.pathname,
  });

  return { reqId, log };
}
