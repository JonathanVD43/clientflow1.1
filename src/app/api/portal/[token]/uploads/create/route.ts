import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/validation/uuid";
import {
  errorResponse,
  successResponse,
  validateJsonBody,
} from "@/lib/api/responses";
import { validateCSRF } from "@/lib/security/csrf";
import { withLoggingRoute } from "@/lib/api/with-logging-route";
import { writeAuditEvent } from "@/lib/audit";

type Body = {
  filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  document_request_id?: string | null;
};

function safeFilename(name: string) {
  return name.replace(/[^\w.\-()+ ]/g, "_");
}

function isPostgrestErrorWithCode(
  e: unknown
): e is { code: string; message?: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code?: unknown }).code === "string"
  );
}

function tokenHint(token: string) {
  if (!token) return "missing";
  if (token.length <= 8) return `${token.slice(0, 2)}…${token.slice(-2)}`;
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export const POST = withLoggingRoute<{ params: Promise<{ token: string }> }>(
  async function POST(req: NextRequest, routeCtx, { reqId, log }) {
    const csrfOk = await validateCSRF();
    if (!csrfOk) {
      log.warn(
        { event: "portal.upload_create.csrf_failed" },
        "csrf validation failed"
      );

      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal.upload_create.csrf_failed",
        severity: "security",
        route: req.nextUrl.pathname,
        method: req.method,
        actorIp:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          undefined,
        actorUserAgent: req.headers.get("user-agent") ?? undefined,
        metadata: {},
      });

      return errorResponse("Invalid origin", 403);
    }

    const { token } = await routeCtx.params;
    const cleanToken = (token ?? "").trim();
    const th = tokenHint(cleanToken);

    if (!cleanToken) {
      log.warn(
        { event: "portal.upload_create.missing_token" },
        "missing token"
      );
      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal.upload_create.missing_token",
        severity: "security",
        route: req.nextUrl.pathname,
        method: req.method,
        actorIp:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          undefined,
        actorUserAgent: req.headers.get("user-agent") ?? undefined,
        metadata: {},
      });
      return errorResponse("Missing token", 400);
    }

    const parsed = await validateJsonBody<Body>(req);
    if (parsed instanceof Response) {
      log.warn(
        { event: "portal.upload_create.bad_json", tokenHint: th },
        "invalid json body"
      );
      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal.upload_create.bad_json",
        severity: "security",
        route: req.nextUrl.pathname,
        method: req.method,
        actorIp:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          undefined,
        actorUserAgent: req.headers.get("user-agent") ?? undefined,
        metadata: { tokenHint: th },
      });
      return parsed;
    }
    const body = parsed;

    const filename = String(body.filename ?? "").trim();
    const mime_type = body.mime_type ? String(body.mime_type).trim() : null;
    const size_bytes =
      typeof body.size_bytes === "number" ? Math.max(0, body.size_bytes) : null;

    const document_request_id = body.document_request_id
      ? String(body.document_request_id).trim()
      : null;

    if (!filename) {
      log.warn(
        { event: "portal.upload_create.missing_filename", tokenHint: th },
        "missing filename"
      );
      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal.upload_create.missing_filename",
        severity: "security",
        route: req.nextUrl.pathname,
        method: req.method,
        actorIp:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          undefined,
        actorUserAgent: req.headers.get("user-agent") ?? undefined,
        metadata: { tokenHint: th },
      });
      return errorResponse("Missing filename", 400);
    }

    if (document_request_id && !isValidUuid(document_request_id)) {
      log.warn(
        {
          event: "portal.upload_create.invalid_document_request_id",
          tokenHint: th,
        },
        "invalid document_request_id"
      );
      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal.upload_create.invalid_document_request_id",
        severity: "security",
        route: req.nextUrl.pathname,
        method: req.method,
        actorIp:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          undefined,
        actorUserAgent: req.headers.get("user-agent") ?? undefined,
        metadata: { tokenHint: th },
      });
      return errorResponse("Invalid document_request_id", 400);
    }

    log.info(
      {
        event: "portal.upload_create.requested",
        tokenHint: th,
        mime_type,
        size_bytes,
        has_document_request_id: Boolean(document_request_id),
      },
      "portal upload create requested"
    );

    const supabase = supabaseAdmin();

    // 1) Find client by public_token
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,user_id,active,portal_enabled")
      .eq("public_token", cleanToken)
      .maybeSingle();

    if (clientErr) {
      log.error(
        {
          event: "portal.upload_create.client_lookup_error",
          tokenHint: th,
          message: clientErr.message,
        },
        "client lookup failed"
      );
      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal.upload_create.client_lookup_error",
        severity: "error",
        route: req.nextUrl.pathname,
        method: req.method,
        metadata: { tokenHint: th },
      });
      return errorResponse(clientErr.message, 500);
    }

    if (!client) {
      log.warn(
        { event: "portal.upload_create.invalid_token", tokenHint: th },
        "invalid token"
      );
      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal.upload_create.invalid_token",
        severity: "security",
        route: req.nextUrl.pathname,
        method: req.method,
        metadata: { tokenHint: th },
      });
      return errorResponse("Invalid token", 404);
    }

    if (!client.active || !client.portal_enabled) {
      log.warn(
        { event: "portal.upload_create.portal_disabled", clientId: client.id },
        "portal disabled"
      );
      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal.upload_create.portal_disabled",
        severity: "security",
        route: req.nextUrl.pathname,
        method: req.method,
        metadata: { clientId: client.id },
      });
      return errorResponse("Portal disabled", 403);
    }

    // 2) Validate doc request belongs to this client (if provided) + fetch max_files
    let maxFiles = 1;

    if (document_request_id) {
      const { data: dr, error: drErr } = await supabase
        .from("document_requests")
        .select("id,max_files,active")
        .eq("id", document_request_id)
        .eq("client_id", client.id)
        .eq("user_id", client.user_id)
        .maybeSingle();

      if (drErr) {
        log.error(
          {
            event: "portal.upload_create.doc_request_lookup_error",
            clientId: client.id,
            message: drErr.message,
          },
          "document request lookup failed"
        );
        await writeAuditEvent({
          requestId: reqId,
          eventType: "portal.upload_create.doc_request_lookup_error",
          severity: "error",
          route: req.nextUrl.pathname,
          method: req.method,
          metadata: { clientId: client.id, document_request_id },
        });
        return errorResponse(drErr.message, 500);
      }

      if (!dr || dr.active !== true) {
        log.warn(
          {
            event: "portal.upload_create.invalid_document_request",
            clientId: client.id,
            document_request_id,
          },
          "invalid document request"
        );
        await writeAuditEvent({
          requestId: reqId,
          eventType: "portal.upload_create.invalid_document_request",
          severity: "security",
          route: req.nextUrl.pathname,
          method: req.method,
          metadata: { clientId: client.id, document_request_id },
        });
        return errorResponse("Invalid document request", 400);
      }

      maxFiles = Math.max(1, Number(dr.max_files ?? 1));
    }

    // 3) Enforce max_files (PENDING + ACCEPTED count; DENIED doesn't count)
    if (document_request_id) {
      const { count, error: countErr } = await supabase
        .from("uploads")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id)
        .eq("user_id", client.user_id)
        .eq("document_request_id", document_request_id)
        .is("deleted_at", null)
        .in("status", ["PENDING", "ACCEPTED"]);

      if (countErr) {
        log.error(
          {
            event: "portal.upload_create.max_files_count_error",
            clientId: client.id,
            message: countErr.message,
          },
          "max files check failed"
        );
        await writeAuditEvent({
          requestId: reqId,
          eventType: "portal.upload_create.max_files_count_error",
          severity: "error",
          route: req.nextUrl.pathname,
          method: req.method,
          metadata: { clientId: client.id, document_request_id },
        });
        return errorResponse(countErr.message, 500);
      }

      if ((count ?? 0) >= maxFiles) {
        log.warn(
          {
            event: "portal.upload_create.max_files_reached",
            clientId: client.id,
            maxFiles,
            count,
          },
          "max files reached"
        );
        await writeAuditEvent({
          requestId: reqId,
          eventType: "portal.upload_create.max_files_reached",
          severity: "security",
          route: req.nextUrl.pathname,
          method: req.method,
          metadata: {
            clientId: client.id,
            document_request_id,
            maxFiles,
            count: count ?? 0,
          },
        });
        return errorResponse(
          `Max files reached for this document (max ${maxFiles}).`,
          409
        );
      }
    }

    // 4) Get-or-create OPEN submission session
    let sessionId: string | null = null;

    const { data: existingSession, error: sessSelErr } = await supabase
      .from("submission_sessions")
      .select("id")
      .eq("user_id", client.user_id)
      .eq("client_id", client.id)
      .eq("status", "OPEN")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessSelErr) return errorResponse(sessSelErr.message, 500);

    if (existingSession?.id) {
      sessionId = existingSession.id as string;
    } else {
      const { data: createdSession, error: sessInsErr } = await supabase
        .from("submission_sessions")
        .insert({
          user_id: client.user_id,
          client_id: client.id,
          status: "OPEN",
        })
        .select("id")
        .single();

      if (!sessInsErr && createdSession?.id) {
        sessionId = createdSession.id as string;
      } else if (
        isPostgrestErrorWithCode(sessInsErr) &&
        sessInsErr.code === "23505"
      ) {
        const { data: s2, error: s2Err } = await supabase
          .from("submission_sessions")
          .select("id")
          .eq("user_id", client.user_id)
          .eq("client_id", client.id)
          .eq("status", "OPEN")
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (s2Err) return errorResponse(s2Err.message, 500);
        sessionId = (s2?.id as string) ?? null;
      } else if (sessInsErr) {
        return errorResponse(sessInsErr.message, 500);
      }
    }

    if (!sessionId)
      return errorResponse("Could not resolve submission session", 500);

    // 5) Create upload row ONCE
    const uploadId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : (await import("node:crypto")).randomUUID();

    const safeName = safeFilename(filename);
    const storage_key = `clients/${client.id}/${uploadId}/${safeName}`;

    const PENDING_TTL_DAYS = 30;
    const delete_after_at = new Date(
      Date.now() + PENDING_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: insErr } = await supabase.from("uploads").insert({
      id: uploadId,
      user_id: client.user_id,
      client_id: client.id,
      submission_session_id: sessionId,
      document_request_id,
      original_filename: filename,
      storage_key,
      mime_type,
      size_bytes,
      status: "PENDING",
      delete_after_at,
    });

    if (insErr) {
      log.error(
        {
          event: "portal.upload_create.db_insert_error",
          clientId: client.id,
          message: insErr.message,
        },
        "upload insert failed"
      );
      await writeAuditEvent({
        requestId: reqId,
        eventType: "upload.created.failed",
        severity: "error",
        route: req.nextUrl.pathname,
        method: req.method,
        metadata: {
          clientId: client.id,
          uploadId,
          document_request_id,
          storage_key,
          mime_type,
          size_bytes,
        },
      });
      return errorResponse(insErr.message, 500);
    }

    // 6) Create signed upload URL (DO NOT LOG signed.token)
    const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET ?? "client_uploads";

    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(storage_key);

    if (signErr || !signed?.token) {
      log.error(
        {
          event: "portal.upload_create.signed_url_error",
          clientId: client.id,
          message: signErr?.message,
        },
        "signed upload url failed"
      );
      await writeAuditEvent({
        requestId: reqId,
        eventType: "upload.signed_url.failed",
        severity: "error",
        route: req.nextUrl.pathname,
        method: req.method,
        metadata: { clientId: client.id, uploadId, bucket, storage_key },
      });
      return errorResponse(
        signErr?.message ?? "Could not create signed upload url",
        500
      );
    }

    log.info(
      {
        event: "upload.created",
        clientId: client.id,
        uploadId,
        bucket,
        storage_key,
        document_request_id,
      },
      "upload created"
    );

    await writeAuditEvent({
      requestId: reqId,
      eventType: "upload.created",
      severity: "info",
      route: req.nextUrl.pathname,
      method: req.method,
      metadata: {
        clientId: client.id,
        uploadId,
        bucket,
        storage_key,
        document_request_id,
        submission_session_id: sessionId,
        mime_type,
        size_bytes,
      },
    });

    return successResponse({
      upload: {
        id: uploadId,
        bucket,
        storage_key,
        document_request_id,
        submission_session_id: sessionId,
      },
      signed: {
        path: storage_key,
        token: signed.token, // returned to client, but never logged
      },
    });
  }
);
