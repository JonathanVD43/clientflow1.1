import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateCSRF } from "@/lib/security/csrf";
import { isValidUuid } from "@/lib/validation/uuid";
import { errorResponse, successResponse } from "@/lib/api/responses";
import { withLoggingRoute, type LoggingCtx } from "@/lib/api/with-logging-route";
import { writeAuditEvent } from "@/lib/audit";

type RouteCtx = { params: Promise<{ token: string; uploadId: string }> };

function tokenHint(token: string) {
  if (!token) return "missing";
  if (token.length <= 8) return `${token.slice(0, 2)}…${token.slice(-2)}`;
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

export const POST = withLoggingRoute<RouteCtx>(
  async function POST(req: NextRequest, routeCtx: RouteCtx, ctx: LoggingCtx) {
    const { reqId, log } = ctx;

    // 0) CSRF / origin
    const csrfOk = await validateCSRF();
    if (!csrfOk) {
      log.warn({ event: "portal.upload_complete.csrf_failed" }, "csrf validation failed");

      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal.upload_complete.csrf_failed",
        severity: "security",
        route: req.nextUrl.pathname,
        method: req.method,
        actorIp: getIp(req),
        actorUserAgent: req.headers.get("user-agent") ?? undefined,
        metadata: {
          origin: req.headers.get("origin") ?? null,
          host: req.headers.get("host") ?? null,
          status: 403,
        },
      });

      return errorResponse("Invalid origin", 403);
    }

    const { token, uploadId } = await routeCtx.params;
    const cleanToken = (token ?? "").trim();
    const th = tokenHint(cleanToken);

    if (!cleanToken) return errorResponse("Missing token", 400);
    if (!uploadId || !isValidUuid(uploadId)) return errorResponse("Invalid uploadId", 400);

    const supabase = supabaseAdmin();

    // 1) Resolve client by token
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,user_id,active,portal_enabled")
      .eq("public_token", cleanToken)
      .maybeSingle();

    if (clientErr) return errorResponse(clientErr.message, 500);
    if (!client) return errorResponse("Invalid token", 404);
    if (!client.active || !client.portal_enabled) return errorResponse("Portal disabled", 403);

    // 2) Load upload; confirm ownership; ignore deleted uploads
    const { data: upload, error: upErr } = await supabase
      .from("uploads")
      .select("id,status,storage_key,client_id,user_id,document_request_id,deleted_at")
      .eq("id", uploadId)
      .maybeSingle();

    if (upErr) return errorResponse(upErr.message, 500);
    if (!upload || upload.deleted_at) return errorResponse("Upload not found", 404);

    if (upload.client_id !== client.id || upload.user_id !== client.user_id) {
      // Don’t leak existence across tenants
      return errorResponse("Upload not found", 404);
    }

    const storage_key = String(upload.storage_key ?? "").trim();
    if (!storage_key) return errorResponse("Upload missing storage key", 500);

    const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET ?? "client_uploads";

    // 3) Best-effort storage existence check (does NOT block completion)
    let storageVerified: boolean | null = null;
    try {
      const parts = storage_key.split("/");
      const filename = parts.pop()!;
      const folder = parts.join("/");

      const { data: listed, error: listErr } = await supabase.storage
        .from(bucket)
        .list(folder, { search: filename, limit: 10 });

      if (listErr) storageVerified = null;
      else storageVerified = (listed ?? []).some((f) => f.name === filename);
    } catch {
      storageVerified = null;
    }

    // 4) Bare-bones “complete”: just stamp uploaded_at.
    // Status remains PENDING; accept/deny stays a future workflow.
    const { error: updErr } = await supabase
      .from("uploads")
      .update({
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", uploadId);

    if (updErr) return errorResponse(updErr.message, 500);

    log.info(
      {
        event: "upload.completed",
        clientId: client.id,
        uploadId,
        bucket,
        storage_key,
        previousStatus: upload.status,
        storageVerified,
      },
      "upload completion recorded"
    );

    await writeAuditEvent({
      requestId: reqId,
      eventType: "upload.completed",
      severity: "info",
      route: req.nextUrl.pathname,
      method: req.method,
      actorIp: getIp(req),
      actorUserAgent: req.headers.get("user-agent") ?? undefined,
      metadata: {
        tokenHint: th,
        clientId: client.id,
        uploadId,
        bucket,
        storage_key,
        previousStatus: upload.status ?? null,
        status: 200,
        storageVerified,
      },
    });

    return successResponse({
      ok: true,
      upload: {
        id: uploadId,
        status: upload.status, // still PENDING today
        bucket,
        storage_key,
        storageVerified,
      },
    });
  }
);
