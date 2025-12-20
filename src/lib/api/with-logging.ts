// src/lib/api/with-logging.ts
import { NextResponse, type NextRequest } from "next/server";
import type { Logger } from "pino";
import { getRequestContext } from "@/lib/request-context";

type HandlerCtx = { reqId: string; log: Logger };
type Handler = (req: NextRequest, ctx: HandlerCtx) => Promise<Response>;

function errorToLogObject(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export function withLogging(handler: Handler) {
  return async function wrapped(req: NextRequest): Promise<Response> {
    const { reqId, log } = getRequestContext(req);
    const start = Date.now();

    log.info({ event: "request.start" }, "request start");

    try {
      const res = await handler(req, { reqId, log });
      const durationMs = Date.now() - start;

      // Ensure x-request-id is on the response, regardless of response type
      if (res instanceof NextResponse) {
        res.headers.set("x-request-id", reqId);
        log.info(
          { event: "request.end", status: res.status, durationMs },
          "request end"
        );
        return res;
      }

      const out = new NextResponse(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
      out.headers.set("x-request-id", reqId);

      log.info(
        { event: "request.end", status: out.status, durationMs },
        "request end"
      );
      return out;
    } catch (err: unknown) {
      const durationMs = Date.now() - start;

      log.error(
        { event: "request.error", durationMs, err: errorToLogObject(err) },
        "request failed"
      );

      const out = NextResponse.json(
        { error: "internal_error", reqId },
        { status: 500 }
      );
      out.headers.set("x-request-id", reqId);
      return out;
    }
  };
}
