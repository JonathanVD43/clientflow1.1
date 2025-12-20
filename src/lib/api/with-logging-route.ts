// src/lib/api/with-logging-route.ts
import { NextResponse, type NextRequest } from "next/server";
import type { Logger } from "pino";
import * as Sentry from "@sentry/nextjs";
import { getRequestContext } from "@/lib/request-context";
import { writeAuditEvent } from "@/lib/audit";

export type LoggingCtx = { reqId: string; log: Logger };

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

function errorToLogObject(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

/**
 * Like withLogging(), but supports Next.js route context (params).
 */
export function withLoggingRoute<RouteCtx>(
  handler: (req: NextRequest, routeCtx: RouteCtx, ctx: LoggingCtx) => Promise<Response>
) {
  return async function wrapped(req: NextRequest, routeCtx: RouteCtx): Promise<Response> {
    const { reqId, log } = getRequestContext(req);
    const start = Date.now();

    log.info({ event: "request.start" }, "request start");

    try {
      const res = await handler(req, routeCtx, { reqId, log });
      const durationMs = Date.now() - start;

      if (res instanceof NextResponse) {
        res.headers.set("x-request-id", reqId);
        log.info({ event: "request.end", status: res.status, durationMs }, "request end");
        return res;
      }

      const out = new NextResponse(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
      out.headers.set("x-request-id", reqId);

      log.info({ event: "request.end", status: out.status, durationMs }, "request end");
      return out;
    } catch (err: unknown) {
      const durationMs = Date.now() - start;

      Sentry.withScope((scope) => {
        scope.setTag("reqId", reqId);
        scope.setContext("request", { method: req.method, path: req.nextUrl.pathname });
        Sentry.captureException(err);
      });

      log.error(
        { event: "request.error", durationMs, err: errorToLogObject(err) },
        "request failed"
      );

      await writeAuditEvent({
        requestId: reqId,
        eventType: "api.error",
        severity: "error",
        route: req.nextUrl.pathname,
        method: req.method,
        actorIp: getIp(req),
        actorUserAgent: req.headers.get("user-agent") ?? undefined,
        metadata: { durationMs },
      });

      const out = NextResponse.json({ error: "internal_error", reqId }, { status: 500 });
      out.headers.set("x-request-id", reqId);
      return out;
    }
  };
}
