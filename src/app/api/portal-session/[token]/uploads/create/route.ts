// src/app/api/portal-session/[token]/uploads/create/route.ts
import { type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateCSRF } from "@/lib/security/csrf";
import { isValidUuid } from "@/lib/validation/uuid";
import { errorResponse, successResponse } from "@/lib/api/responses";
import { withLoggingRoute, type LoggingCtx } from "@/lib/api/with-logging-route";
import { writeAuditEvent } from "@/lib/audit";

type RouteCtx = { params: Promise<{ token: string }> };

type Body = {
  filename: string;
  document_request_id: string;
  mime_type?: string | null;
  size_bytes?: number | null;
};

type SessionRow = {
  id: string;
  client_id: string;
  user_id: string;
  status: "OPEN" | "FINALIZED" | "EXPIRED";
};

type ClientRow = {
  id: string;
  user_id: string;
  active: boolean;
  portal_enabled: boolean;
};

type AllowedJoinRow = { id: string };
type ExistingUploadRow = { id: string };

type JsonParseOk<T> = { ok: true; data: T };
type JsonParseErr = { ok: false; error: string };
type JsonParseResult<T> = JsonParseOk<T> | JsonParseErr;

async function parseJsonBody<T>(req: NextRequest): Promise<JsonParseResult<T>> {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return { ok: false, error: "Expected application/json body" };
    }
    const raw = (await req.json()) as unknown;
    return { ok: true, data: raw as T };
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
}

function tokenHint(token: string) {
  if (!token) return "missing";
  if (token.length <= 8) return `${token.slice(0, 2)}…${token.slice(-2)}`;
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function getIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
}

function safeFilename(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 180) || "file";
}

type SignedUploadResult = {
  signedUrl?: string;
  signedURL?: string;
  url?: string;
};

function extractSignedUrl(signed: SignedUploadResult): string | null {
  if (typeof signed.signedUrl === "string" && signed.signedUrl.trim()) return signed.signedUrl;
  if (typeof signed.signedURL === "string" && signed.signedURL.trim()) return signed.signedURL;
  if (typeof signed.url === "string" && signed.url.trim()) return signed.url;
  return null;
}

export const POST = withLoggingRoute<RouteCtx>(
  async function POST(req: NextRequest, routeCtx: RouteCtx, ctx: LoggingCtx) {
    const { reqId, log } = ctx;

    // 0) CSRF / origin
    const csrfOk = await validateCSRF();
    if (!csrfOk) {
      await writeAuditEvent({
        requestId: reqId,
        eventType: "portal_session.upload_create.csrf_failed",
        severity: "security",
        route: req.nextUrl.pathname,
        method: req.method,
        actorIp: getIp(req),
        actorUserAgent: req.headers.get("user-agent") ?? undefined,
        metadata: { status: 403 },
      });
      return errorResponse("Invalid origin", 403);
    }

    const { token } = await routeCtx.params;
    const cleanToken = (token ?? "").trim();
    const th = tokenHint(cleanToken);

    if (!cleanToken) return errorResponse("Missing token", 400);

    // 1) Parse JSON
    const parsed = await parseJsonBody<Body>(req);
    if (!parsed.ok) return errorResponse(parsed.error, 400);

    const filename = String(parsed.data.filename ?? "").trim();
    const document_request_id = String(parsed.data.document_request_id ?? "").trim();
    const mime_type =
      parsed.data.mime_type != null ? String(parsed.data.mime_type).trim() : null;
    const size_bytes =
      typeof parsed.data.size_bytes === "number" ? parsed.data.size_bytes : null;

    if (!filename) return errorResponse("Missing filename", 400);
    if (!document_request_id || !isValidUuid(document_request_id)) {
      return errorResponse("Invalid document_request_id", 400);
    }

    const supabase = supabaseAdmin();

    // 2) Resolve session by token
    const { data: session, error: sessErr } = await supabase
      .from("submission_sessions")
      .select("id,client_id,user_id,status")
      .eq("public_token", cleanToken)
      .maybeSingle<SessionRow>();

    if (sessErr) return errorResponse(sessErr.message, 500);
    if (!session) return errorResponse("Invalid token", 404);
    if (session.status !== "OPEN") return errorResponse("This request is completed", 410);

    // 3) Resolve client (must be active + portal enabled)
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id,user_id,active,portal_enabled")
      .eq("id", session.client_id)
      .eq("user_id", session.user_id)
      .maybeSingle<ClientRow>();

    if (clientErr) return errorResponse(clientErr.message, 500);
    if (!client) return errorResponse("Client not found", 404);
    if (!client.active || !client.portal_enabled) return errorResponse("Portal disabled", 403);

    // 4) Ensure doc is requested for THIS session
    const { data: allowed, error: allowedErr } = await supabase
      .from("submission_session_document_requests")
      .select("id")
      .eq("submission_session_id", session.id)
      .eq("document_request_id", document_request_id)
      .eq("user_id", session.user_id)
      .maybeSingle<AllowedJoinRow>();

    if (allowedErr) return errorResponse(allowedErr.message, 500);
    if (!allowed) return errorResponse("This file is not requested for this link", 403);

    // 5) Enforce one upload per field per session
    const { data: existing, error: existErr } = await supabase
      .from("uploads")
      .select("id")
      .eq("submission_session_id", session.id)
      .eq("document_request_id", document_request_id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle<ExistingUploadRow>();

    if (existErr) return errorResponse(existErr.message, 500);
    if (existing) return errorResponse("This file has already been submitted", 409);

    // 6) Create upload row
    const uploadId =
      typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
        ? globalThis.crypto.randomUUID()
        : (await import("node:crypto")).randomUUID();

    const storage_key = `clients/${client.id}/${uploadId}/${safeFilename(filename)}`;
    const delete_after_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: insErr } = await supabase.from("uploads").insert({
      id: uploadId,
      user_id: session.user_id,
      client_id: client.id,
      submission_session_id: session.id,
      document_request_id,
      original_filename: filename,
      storage_key,
      mime_type,
      size_bytes,
      status: "PENDING",
      delete_after_at,
    });

    if (insErr) return errorResponse(insErr.message, 500);

    // 7) Signed upload URL (absolute)
    const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET ?? "client_uploads";
    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(storage_key);

    if (signErr) return errorResponse(signErr.message, 500);
    if (!signed) return errorResponse("Could not create signed upload url", 500);

    const signedUrl = extractSignedUrl(signed as SignedUploadResult);
    if (!signedUrl) {
      // We intentionally do not fallback to path+token because it caused localhost URL bugs.
      return errorResponse(
        "Signed upload URL missing from Supabase response. Please upgrade supabase-js or adjust storage signing method.",
        500
      );
    }

    await writeAuditEvent({
      requestId: reqId,
      eventType: "portal_session.upload.created",
      severity: "info",
      route: req.nextUrl.pathname,
      method: req.method,
      actorIp: getIp(req),
      actorUserAgent: req.headers.get("user-agent") ?? undefined,
      metadata: {
        tokenHint: th,
        clientId: client.id,
        sessionId: session.id,
        uploadId,
        document_request_id,
        bucket,
        storage_key,
        status: 200,
      },
    });

    log.info(
      { event: "portal_session.upload.created", sessionId: session.id, uploadId },
      "upload record created"
    );

    return successResponse({
      ok: true,
      upload: {
        id: uploadId,
        bucket,
        storage_key,
        document_request_id,
        submission_session_id: session.id,
      },
      signedUrl,
    });
  }
);
