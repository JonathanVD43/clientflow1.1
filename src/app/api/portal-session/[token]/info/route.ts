// src/app/api/portal-session/[token]/info/route.ts
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, successResponse } from "@/lib/api/responses";
import { validateCSRF } from "@/lib/security/csrf";

type SessionRow = {
  id: string;
  client_id: string;
  user_id: string;
  status: "OPEN" | "FINALIZED" | "EXPIRED";
  opened_at: string | null;
  finalized_at: string | null;
};

type ClientRow = {
  id: string;
  name: string;
  active: boolean;
  portal_enabled: boolean;
  due_day_of_month: number | null;
  due_timezone: string | null;
};

type DocumentRequestRow = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  active: boolean;
  sort_order: number;
  max_files: number;
  allowed_mime_types: string[] | null;
};

type RequestedJoinRow = {
  document_request_id: string;
  document_requests: DocumentRequestRow | null;
};

type SubmittedUploadRow = {
  document_request_id: string;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const csrfOk = await validateCSRF();
  if (!csrfOk) return errorResponse("Invalid origin", 403);

  const { token } = await ctx.params;
  const cleanToken = (token ?? "").trim();
  if (!cleanToken) return errorResponse("Missing token", 400);

  const supabase = supabaseAdmin();

  // 1) Resolve session
  const { data: session, error: sessErr } = await supabase
    .from("submission_sessions")
    .select("id,client_id,user_id,status,opened_at,finalized_at")
    .eq("public_token", cleanToken)
    .maybeSingle<SessionRow>();

  if (sessErr) return errorResponse(sessErr.message, 500);
  if (!session) return errorResponse("Invalid token", 404);
  if (session.status !== "OPEN")
    return errorResponse("This request is completed", 410);

  // 2) Resolve client
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id,name,active,portal_enabled,due_day_of_month,due_timezone")
    .eq("id", session.client_id)
    .eq("user_id", session.user_id)
    .maybeSingle<ClientRow>();

  if (clientErr) return errorResponse(clientErr.message, 500);
  if (!client) return errorResponse("Client not found", 404);
  if (!client.active || !client.portal_enabled)
    return errorResponse("Portal disabled", 403);

  // 3) Requested fields for this session
  const { data: requested, error: reqErr } = await supabase
    .from("submission_session_document_requests")
    .select(
      `
      document_request_id,
      document_requests (
        id,
        title,
        description,
        required,
        active,
        sort_order,
        max_files,
        allowed_mime_types
      )
    `
    )
    .eq("submission_session_id", session.id)
    .eq("user_id", session.user_id)
    // ✅ join table has created_at, not uploaded_at
    .order("created_at", { ascending: true })
    .returns<RequestedJoinRow[]>();

  if (reqErr) return errorResponse(reqErr.message, 500);

  const documents: DocumentRequestRow[] = (requested ?? [])
    .map((r) => r.document_requests)
    .filter((d): d is DocumentRequestRow => d !== null)
    .sort((a, b) => a.sort_order - b.sort_order);

  // 4) Submitted fields
  const { data: submittedRows, error: subErr } = await supabase
    .from("uploads")
    .select("document_request_id")
    .eq("submission_session_id", session.id)
    .is("deleted_at", null)
    .not("uploaded_at", "is", null)
    .returns<SubmittedUploadRow[]>();

  if (subErr) return errorResponse(subErr.message, 500);

  const submittedSet = new Set(
    (submittedRows ?? []).map((r) => r.document_request_id)
  );

  return successResponse({
    session: {
      id: session.id,
      opened_at: session.opened_at,
    },
    client: {
      id: client.id,
      name: client.name,
      due_day_of_month: client.due_day_of_month,
      due_timezone: client.due_timezone,
    },
    documents: documents.map((d) => ({
      ...d,
      submitted: submittedSet.has(d.id),
    })),
  });
}
