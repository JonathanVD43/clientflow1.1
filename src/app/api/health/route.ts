import { NextResponse, type NextRequest } from "next/server";
import { withLogging } from "@/lib/api/with-logging";

export const GET = withLogging(async function GET(_req: NextRequest, { log, reqId }) {
  log.info({ event: "health.check" }, "health check ok");
  return NextResponse.json({ ok: true, reqId, ts: Date.now() });
});
