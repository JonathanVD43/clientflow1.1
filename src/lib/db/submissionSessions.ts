// src/lib/db/submissionSessions.ts
import { requireUser } from "@/lib/auth/require-user";
import { assertUuid } from "@/lib/validation/uuid";

type SessionStatus = "OPEN" | "FINALIZED" | "EXPIRED";

export type CreatedSubmissionSession = {
  id: string;
  public_token: string;
  status: SessionStatus;
  opened_at: string | null;
};

function uniqStrings(xs: string[]) {
  return Array.from(new Set(xs.map((s) => s.trim()).filter(Boolean)));
}

export async function createSubmissionSessionForClient(input: {
  clientId: string;
  documentRequestIds: string[];
}): Promise<CreatedSubmissionSession> {
  assertUuid("clientId", input.clientId);

  const ids = uniqStrings(input.documentRequestIds);
  if (ids.length === 0) {
    throw new Error("Select at least one document to request");
  }
  for (const id of ids) assertUuid("documentRequestId", id);

  const { supabase, user } = await requireUser();

  // 1) Ensure client belongs to user
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select("id")
    .eq("id", input.clientId)
    .eq("user_id", user.id)
    .single();

  if (cErr) throw cErr;
  if (!client) throw new Error("Client not found");

  // 2) Ensure all selected document requests belong to this client + user and are active
  const { data: docs, error: dErr } = await supabase
    .from("document_requests")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("id", ids);

  if (dErr) throw dErr;

  const found = new Set((docs ?? []).map((d) => d.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new Error("One or more selected documents are invalid or inactive");
  }

  // 3) ✅ Best-practice: expire any existing OPEN session for this (user, client)
  // This avoids 23505 from submission_sessions_one_open_per_client and ensures old links stop working.
  const nowIso = new Date().toISOString();
  const { error: closeErr } = await supabase
    .from("submission_sessions")
    .update({
      status: "EXPIRED",
      expires_at: nowIso,
      updated_at: nowIso,
    })
    .eq("user_id", user.id)
    .eq("client_id", input.clientId)
    .eq("status", "OPEN");

  if (closeErr) throw closeErr;

  // 4) Create the new OPEN session
  const { data: session, error: sErr } = await supabase
    .from("submission_sessions")
    .insert({
      user_id: user.id,
      client_id: input.clientId,
      status: "OPEN",
      opened_at: nowIso,
    })
    .select("id,public_token,status,opened_at")
    .single();

  if (sErr) throw sErr;

  if (!session?.id || !session?.public_token) {
    throw new Error("Session created but token missing");
  }

  // 5) Attach requested docs to session
  const joinRows = ids.map((document_request_id) => ({
    user_id: user.id,
    client_id: input.clientId,
    submission_session_id: session.id,
    document_request_id,
  }));

  const { error: jErr } = await supabase
    .from("submission_session_document_requests")
    .insert(joinRows);

  if (jErr) throw jErr;

  return {
    id: session.id,
    public_token: session.public_token,
    status: session.status as SessionStatus,
    opened_at: session.opened_at ?? null,
  };
}
