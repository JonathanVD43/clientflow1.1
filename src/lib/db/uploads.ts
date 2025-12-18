import { supabaseServer } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(label: string, value: string) {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid ${label} (expected uuid): "${value}"`);
  }
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
    .eq("user_id", user.id)
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
  // Helps the UI show “sessionless” items clearly if any remain
  is_fallback_session: boolean;
};

type InboxUploadJoinRow = {
  id: string;
  client_id: string;
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

type ClientRow = {
  id: string;
  name: string | null;
  email: string | null;
};

export async function listInboxSessions(): Promise<InboxSessionRow[]> {
  const { supabase, user } = await requireUser();

  // Pull pending uploads + their session (if any)
  const { data, error } = await supabase
    .from("uploads")
    .select(
      `
      id,
      client_id,
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
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as InboxUploadJoinRow[];

  // We will group by session id when available.
  // If session is missing (legacy rows), group them under a stable fallback key per client.
  const map = new Map<string, InboxSessionRow>();

  // For fallback grouping we may need client info
  const fallbackClientIds = new Set<string>();
  for (const r of rows) {
    if (!r.submission_session?.id && r.client_id) fallbackClientIds.add(r.client_id);
  }

  let fallbackClientMap = new Map<string, ClientRow>();
  if (fallbackClientIds.size > 0) {
    const { data: clients, error: cErr } = await supabase
      .from("clients")
      .select("id,name,email")
      .eq("user_id", user.id)
      .in("id", Array.from(fallbackClientIds));

    if (cErr) throw cErr;
    fallbackClientMap = new Map((clients ?? []).map((c) => [c.id, c as ClientRow]));
  }

  for (const r of rows) {
    const isNew = r.viewed_at == null;

    const session = r.submission_session;
    const client = session?.client;

    // Normal path (session exists)
    if (session?.id && client?.id) {
      const key = session.id;
      const existing = map.get(key);

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
          is_fallback_session: false,
        });
      } else {
        existing.pending_count += 1;
        if (isNew) existing.new_count += 1;
      }

      continue;
    }

    // Fallback path (no session): group by client_id
    const cid = r.client_id;
    if (!cid) continue;

    const c = fallbackClientMap.get(cid);
    if (!c) continue;

    const key = `fallback:${cid}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        session_id: key, // not a real uuid; UI should treat this as “needs migration”
        client_id: cid,
        client_name: c.name ?? "(unnamed)",
        client_email: c.email ?? null,
        opened_at: null,
        pending_count: 1,
        new_count: isNew ? 1 : 0,
        last_uploaded_at: r.uploaded_at ?? null,
        is_fallback_session: true,
      });
    } else {
      existing.pending_count += 1;
      if (isNew) existing.new_count += 1;
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
    .select("id,original_filename,uploaded_at,viewed_at,mime_type,size_bytes,document_request_id")
    .eq("user_id", user.id)
    .eq("submission_session_id", sessionId)
    .eq("status", "PENDING")
    .is("deleted_at", null)
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

/**
 * Finds the newest *real* session id for a client.
 * This is what `/inbox/client/[clientId]` should use to redirect.
 */
export async function getLatestSessionIdForClient(clientId: string): Promise<string | null> {
  assertUuid("clientId", clientId);

  const { supabase, user } = await requireUser();

  // Prefer newest session row
  const { data: sess, error: sErr } = await supabase
    .from("submission_sessions")
    .select("id")
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sErr) throw sErr;
  if (sess?.id) return String(sess.id);

  // Fallback: newest upload with a session id
  const { data: up, error: uErr } = await supabase
    .from("uploads")
    .select("submission_session_id")
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .not("submission_session_id", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (uErr) throw uErr;
  return up?.submission_session_id ? String(up.submission_session_id) : null;
}

export async function listInboxClientsWithPendingCounts() {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select("client_id, viewed_at", { count: "exact" })
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .is("deleted_at", null);

  if (error) throw error;

  const byClient = new Map<
    string,
    { client_id: string; pending_total: number; pending_new: number }
  >();

  for (const row of data ?? []) {
    const cid = String((row as { client_id: string }).client_id);
    const viewed = (row as { viewed_at?: string | null }).viewed_at ?? null;

    const cur =
      byClient.get(cid) ?? { client_id: cid, pending_total: 0, pending_new: 0 };
    cur.pending_total += 1;
    if (!viewed) cur.pending_new += 1;
    byClient.set(cid, cur);
  }

  const clientIds = Array.from(byClient.keys());
  if (clientIds.length === 0) return [];

  const { data: clients, error: cErr } = await supabase
    .from("clients")
    .select("id,name,email")
    .eq("user_id", user.id)
    .in("id", clientIds);

  if (cErr) throw cErr;

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));

  return clientIds
    .map((id) => ({
      client: clientMap.get(id),
      ...byClient.get(id)!,
    }))
    .filter((x) => x.client);
}

export async function listPendingUploadsForClient(clientId: string) {
  assertUuid("clientId", clientId);

  const { supabase, user } = await requireUser();

  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select("id,name,email")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();

  if (cErr) throw cErr;

  const { data: uploads, error } = await supabase
    .from("uploads")
    .select(
      "id,client_id,submission_session_id,document_request_id,original_filename,mime_type,size_bytes,status,denial_reason,uploaded_at,viewed_at,reviewed_at,storage_key"
    )
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  return { client, uploads: uploads ?? [] };
}

export async function listClientIdsWithUnseenPendingUploads() {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select("client_id")
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .is("deleted_at", null)
    .is("viewed_at", null);

  if (error) throw error;

  return new Set((data ?? []).map((r) => String(r.client_id)));
}

export async function getOpenSessionIdForClient(clientId: string) {
  if (!UUID_RE.test(clientId)) throw new Error("Invalid clientId");

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("submission_sessions")
    .select("id")
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .eq("status", "OPEN")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

