// src/app/api/portal/[token]/uploads/create/route.ts
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/validation/uuid";
import {
  errorResponse,
  successResponse,
  validateJsonBody,
} from "@/lib/api/responses";
import { validateCSRF } from "@/lib/security/csrf";

type Body = {
  filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  document_request_id?: string | null;
};

function safeFilename(name: string) {
  // keep it predictable + storage-safe
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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const csrfOk = await validateCSRF();
  if (!csrfOk) return errorResponse("Invalid origin", 403);

  const { token } = await ctx.params;
  const cleanToken = (token ?? "").trim();
  if (!cleanToken) return errorResponse("Missing token", 400);

  const parsed = await validateJsonBody<Body>(req);
  if (parsed instanceof Response) return parsed;
  const body = parsed;

  const filename = String(body.filename ?? "").trim();
  const mime_type = body.mime_type ? String(body.mime_type).trim() : null;
  const size_bytes =
    typeof body.size_bytes === "number" ? Math.max(0, body.size_bytes) : null;

  const document_request_id = body.document_request_id
    ? String(body.document_request_id).trim()
    : null;

  if (!filename) return errorResponse("Missing filename", 400);
  if (document_request_id && !isValidUuid(document_request_id)) {
    return errorResponse("Invalid document_request_id", 400);
  }

  const supabase = supabaseAdmin();

  // 1) Find client by public_token
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id,user_id,active,portal_enabled")
    .eq("public_token", cleanToken)
    .maybeSingle();

  if (clientErr) return errorResponse(clientErr.message, 500);
  if (!client) return errorResponse("Invalid token", 404);
  if (!client.active || !client.portal_enabled)
    return errorResponse("Portal disabled", 403);

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

    if (drErr) return errorResponse(drErr.message, 500);
    if (!dr || dr.active !== true)
      return errorResponse("Invalid document request", 400);

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

    if (countErr) return errorResponse(countErr.message, 500);

    if ((count ?? 0) >= maxFiles) {
      return errorResponse(
        `Max files reached for this document (max ${maxFiles}).`,
        409
      );
    }
  }

  // 4) Get-or-create OPEN submission session (REUSE existing to avoid 23505)
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

  // 5) Create upload row ONCE (avoid storage_key null constraint)
  const uploadId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : (await import("node:crypto")).randomUUID();

  const safeName = safeFilename(filename);
  const storage_key = `clients/${client.id}/${uploadId}/${safeName}`;

  // Pending uploads expire after 30 days if never accepted/denied.
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

  if (insErr) return errorResponse(insErr.message, 500);

  // 6) Create signed upload URL
  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET ?? "client_uploads";

  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storage_key);

  if (signErr || !signed?.token) {
    return errorResponse(
      signErr?.message ?? "Could not create signed upload url",
      500
    );
  }

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
      token: signed.token,
    },
  });
}
