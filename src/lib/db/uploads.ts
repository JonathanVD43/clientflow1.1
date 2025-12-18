import { supabaseServer } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(label: string, value: string) {
  if (!UUID_RE.test(value)) throw new Error(`Invalid ${label} (expected uuid): "${value}"`);
}

async function requireUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error("Not authenticated");
  return { supabase, user };
}

/** Core upload row used by user-side pages */
export type UploadRow = {
  id: string;
  client_id: string;
  submission_session_id: string | null;
  document_request_id: string | null;
  original_filename: string;
  storage_key?: string; // only present when selecting it
  mime_type: string | null;
  size_bytes: number | null;
  status: "PENDING" | "ACCEPTED" | "DENIED";
  denial_reason: string | null;
  uploaded_at: string;
  viewed_at: string | null;
  reviewed_at: string | null;
  deleted_at?: string | null;
};

export async function listUploadsForClient(clientId: string): Promise<UploadRow[]> {
  assertUuid("clientId", clientId);

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      "id,client_id,submission_session_id,document_request_id,original_filename,mime_type,size_bytes,status,denial_reason,uploaded_at,viewed_at,reviewed_at,deleted_at"
    )
    .eq("client_id", clientId)
    .eq("user_id", user.id) // defense-in-depth
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as UploadRow[];
}

export async function getUpload(uploadId: string): Promise<UploadRow> {
  assertUuid("uploadId", uploadId);

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      "id,client_id,submission_session_id,document_request_id,original_filename,storage_key,mime_type,size_bytes,status,denial_reason,uploaded_at,viewed_at,reviewed_at,deleted_at"
    )
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .single();

  if (error) throw error;
  return data as UploadRow;
}

export async function markUploadViewed(uploadId: string): Promise<{ id: string }> {
  assertUuid("uploadId", uploadId);

  const { supabase, user } = await requireUser();

  // Idempotent: only set if currently null
  const { data, error } = await supabase
    .from("uploads")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .is("viewed_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data?.id ? { id: data.id as string } : { id: uploadId };
}

export async function reviewUpload(input: {
  uploadId: string;
  status: "ACCEPTED" | "DENIED";
  denial_reason?: string | null;
}): Promise<{ id: string }> {
  assertUuid("uploadId", input.uploadId);

  const { supabase, user } = await requireUser();

  const patch: Record<string, unknown> = {
    status: input.status,
    reviewed_at: new Date().toISOString(),
  };

  if (input.status === "DENIED") {
    const reason = String(input.denial_reason ?? "").trim();
    if (!reason) throw new Error("Denial reason is required");
    patch.denial_reason = reason;
  } else {
    patch.denial_reason = null;
  }

  const { data, error } = await supabase
    .from("uploads")
    .update(patch)
    .eq("id", input.uploadId)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Review update failed");
  return { id: data.id as string };
}

/* =========================
   Inbox (session-grouped)
   ========================= */

export type InboxSessionRow = {
  session_id: string;
  client_id: string;
  client_name: string;
  client_email: string | null;
  opened_at: string | null;
  pending_count: number;
  new_count: number;
  last_uploaded_at: string | null;
};

type InboxUploadJoinRow = {
  id: string;
  uploaded_at: string;
  viewed_at: string | null;
  status: "PENDING" | "ACCEPTED" | "DENIED";
  submission_session: {
    id: string;
    opened_at: string | null;
    status: "OPEN" | "FINALIZED" | "EXPIRED" | string;
    client: {
      id: string;
      name: string | null;
      email: string | null;
    } | null;
  } | null;
};

export async function listInboxSessions(): Promise<InboxSessionRow[]> {
  const { supabase, user } = await requireUser();

  // Grab pending uploads with session+client embedded, then group.
  const { data, error } = await supabase
    .from("uploads")
    .select(
      `
      id,
      uploaded_at,
      viewed_at,
      status,
      submission_session:submission_sessions (
        id,
        opened_at,
        status,
        client:clients (
          id,
          name,
          email
        )
      )
    `
    )
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as InboxUploadJoinRow[];

  const map = new Map<string, InboxSessionRow>();

  for (const r of rows) {
    const session = r.submission_session;
    const client = session?.client;

    if (!session?.id || !client?.id) continue;

    const key = session.id;
    const existing = map.get(key);
    const isNew = r.viewed_at == null;

    if (!existing) {
      map.set(key, {
        session_id: session.id,
        client_id: client.id,
        client_name: client.name ?? "(unnamed)",
        client_email: client.email ?? null,
        opened_at: session.opened_at ?? null,
        pending_count: 1,
        new_count: isNew ? 1 : 0,
        last_uploaded_at: r.uploaded_at ?? null,
      });
    } else {
      existing.pending_count += 1;
      if (isNew) existing.new_count += 1;
      // uploaded_at is already sorted desc; keep first value as last_uploaded_at
    }
  }

  return Array.from(map.values());
}

export type InboxUploadRow = {
  id: string;
  original_filename: string;
  uploaded_at: string;
  viewed_at: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  document_request_id: string | null;
};

type SessionWithClientRow = {
  id: string;
  opened_at: string | null;
  status: string;
  client: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

export async function listPendingUploadsForSession(sessionId: string): Promise<{
  session: { id: string; opened_at: string | null; status: string };
  client: { id: string; name: string; email: string | null };
  uploads: InboxUploadRow[];
}> {
  assertUuid("sessionId", sessionId);

  const { supabase, user } = await requireUser();

  const { data: session, error: sessErr } = await supabase
    .from("submission_sessions")
    .select(
      `
      id,
      opened_at,
      status,
      client:clients (
        id,
        name,
        email
      )
    `
    )
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessErr) throw sessErr;

  const s = session as unknown as SessionWithClientRow;
  if (!s.client?.id) throw new Error("Session has no client");

  const { data: uploads, error } = await supabase
    .from("uploads")
    .select(
      "id,original_filename,uploaded_at,viewed_at,mime_type,size_bytes,document_request_id"
    )
    .eq("user_id", user.id)
    .eq("submission_session_id", sessionId)
    .eq("status", "PENDING")
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  return {
    session: { id: s.id, opened_at: s.opened_at ?? null, status: s.status },
    client: {
      id: s.client.id,
      name: s.client.name ?? "(unnamed)",
      email: s.client.email ?? null,
    },
    uploads: (uploads ?? []) as InboxUploadRow[],
  };
}
