// src/app/api/public/client/[token]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { withLogging } from "@/lib/api/with-logging";
import { writeAuditEvent } from "@/lib/audit";

// Example: replace this with your real DB lookup
async function isTokenValid(token: string): Promise<boolean> {
  // TODO: check token against your Supabase table
  return token.length > 10;
}

export const GET = withLogging(async function GET(
  req: NextRequest,
  { reqId, log }
) {
  const token = req.nextUrl.pathname.split("/").pop() ?? "";

  // IMPORTANT: never log the token itself
  const tokenHint = token ? `${token.slice(0, 4)}…${token.slice(-4)}` : "missing";

  const ok = await isTokenValid(token);

  if (!ok) {
    log.warn(
      { event: "token.validation.failed", tokenHint },
      "public token validation failed"
    );

    await writeAuditEvent({
      requestId: reqId,
      eventType: "token.validation.failed",
      severity: "security",
      route: req.nextUrl.pathname,
      method: req.method,
      actorIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      actorUserAgent: req.headers.get("user-agent") ?? undefined,
      metadata: { tokenHint },
    });

    return NextResponse.json({ ok: false }, { status: 401 });
  }

  log.info(
    { event: "token.validation.success", tokenHint },
    "public token validation success"
  );

  await writeAuditEvent({
    requestId: reqId,
    eventType: "token.validation.success",
    severity: "info",
    route: req.nextUrl.pathname,
    method: req.method,
    actorIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    actorUserAgent: req.headers.get("user-agent") ?? undefined,
    metadata: { tokenHint },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
});
