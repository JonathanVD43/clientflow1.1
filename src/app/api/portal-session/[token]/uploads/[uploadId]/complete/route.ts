// src/app/api/portal-session/[token]/uploads/[uploadId]/complete/route.ts
import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateCSRF } from "@/lib/security/csrf";
import { isValidUuid } from "@/lib/validation/uuid";
import { errorResponse, successResponse } from "@/lib/api/responses";
import { withLoggingRoute, type LoggingCtx } from "@/lib/api/with-logging-route";
import { writeAuditEvent } from "@/lib/audit";

type RouteCtx = { params: Promise<{ token: string; uploadId: string }> };

type SessionRow = {
  id: string;
  client_id: string;
  user_id: string;
  status: "OPEN" | "FINALIZED" | "EXPIRED";
};

type UploadRow = {
  id: string;
  client_id: string;
  user_id: string;
  submission_session_id: string;
  document_request_id: string;
  deleted_at: string | null;
  status: "PENDING" | "ACCEPTED" | "DENIED";
};

type SubmittedRow = { document_request_id: string };

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

    const csrfOk = await validateCSRF();
    if (!csrfOk) return errorResponse("Invalid origin", 403);

    const { token, uploadId } = await routeCtx.params;
    const cleanToken = (token ?? "").trim();
    const th = tokenHint(cleanToken);

    if (!cleanToken) return errorResponse("Missing token", 400);
    if (!uploadId || !isValidUuid(uploadId)) return errorResponse("Invalid uploadId", 400);

    const supabase = supabaseAdmin();

    // 1) Resolve session
    const { data: session, error: sessErr } = await supabase
      .from("submission_sessions")
      .select("id,client_id,user_id,status")
      .eq("public_token", cleanToken)
      .maybeSingle<SessionRow>();

    if (sessErr) return errorResponse(sessErr.message, 500);
    if (!session) return errorResponse("Invalid token", 404);
    if (session.status !== "OPEN") return errorResponse("This request is completed", 410);

    // 2) Resolve upload and verify ownership/session
    const { data: upload, error: upErr } = await supabase
      .from("uploads")
      .select(
        "id,client_id,user_id,submission_session_id,document_request_id,deleted_at,status"
      )
      .eq("id", uploadId)
      .maybeSingle<UploadRow>();

    if (upErr) return errorResponse(upErr.message, 500);
    if (!upload || upload.deleted_at) return errorResponse("Upload not found", 404);

    if (
      upload.client_id !== session.client_id ||
      upload.user_id !== session.user_id ||
      upload.submission_session_id !== session.id
    ) {
      return errorResponse("Upload not found", 404);
    }

    const nowIso = new Date().toISOString();

    // 3) Stamp uploaded_at (idempotent)
    const { error: updErr } = await supabase
      .from("uploads")
      .update({ uploaded_at: nowIso })
      .eq("id", uploadId);

    if (updErr) return errorResponse(updErr.message, 500);

    // 4) Completion check: expected fields vs submitted fields
    const { count: expectedCount, error: expErr } = await supabase
      .from("submission_session_document_requests")
      .select("id", { count: "exact", head: true })
      .eq("submission_session_id", session.id);

    if (expErr) return errorResponse(expErr.message, 500);

    const { data: submittedRows, error: subErr } = await supabase
      .from("uploads")
      .select("document_request_id")
      .eq("submission_session_id", session.id)
      .is("deleted_at", null)
      .not("uploaded_at", "is", null)
      .returns<SubmittedRow[]>();

    if (subErr) return errorResponse(subErr.message, 500);

    const submittedCount = new Set(
      (submittedRows ?? []).map((r) => r.document_request_id)
    ).size;

    let finalized = false;
    if ((expectedCount ?? 0) > 0 && submittedCount >= (expectedCount ?? 0)) {
      const { error: finErr } = await supabase
        .from("submission_sessions")
        .update({ status: "FINALIZED", finalized_at: nowIso })
        .eq("id", session.id)
        .eq("status", "OPEN");

      if (!finErr) finalized = true;
    }

    await writeAuditEvent({
      requestId: reqId,
      eventType: "portal_session.upload.completed",
      severity: "info",
      route: req.nextUrl.pathname,
      method: req.method,
      actorIp: getIp(req),
      actorUserAgent: req.headers.get("user-agent") ?? undefined,
      metadata: {
        tokenHint: th,
        uploadId,
        sessionId: session.id,
        expectedCount: expectedCount ?? null,
        submittedCount,
        finalized,
        status: 200,
      },
    });

    log.info(
      {
        event: "portal_session.upload.completed",
        uploadId,
        sessionId: session.id,
        expectedCount,
        submittedCount,
        finalized,
      },
      "upload completion recorded"
    );

    return successResponse({
      ok: true,
      upload: { id: uploadId, status: upload.status },
      session: { id: session.id, finalized },
    });
  }
);
