// src/lib/db/uploads.ts
import { requireUser } from "@/lib/auth/require-user";
import { assertUuid } from "@/lib/validation/uuid";

type UploadStatus = "PENDING" | "ACCEPTED" | "DENIED";
type SessionStatus = "OPEN" | "FINALIZED" | "EXPIRED";

function normalizeOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function isoNow() {
  return new Date().toISOString();
}

function safeFilename(name: string) {
  const base = String(name || "file").trim() || "file";
  return base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 180) || "file";
}

/** Core upload row used by inbox pages */
export type UploadRow = {
  id: string;
  client_id: string;
  submission_session_id: string | null;
  document_request_id: string | null;
  original_filename: string;
  storage_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: UploadStatus;
  denial_reason: string | null;
  uploaded_at: string | null;
  viewed_at: string | null;
  reviewed_at: string | null;
  deleted_at: string | null;
  delete_after_at: string | null;
};

export async function getUpload(uploadId: string): Promise<UploadRow> {
  assertUuid("uploadId", uploadId);
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      [
        "id",
        "client_id",
        "submission_session_id",
        "document_request_id",
        "original_filename",
        "storage_key",
        "mime_type",
        "size_bytes",
        "status",
        "denial_reason",
        "uploaded_at",
        "viewed_at",
        "reviewed_at",
        "deleted_at",
        "delete_after_at",
      ].join(",")
    )
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as UploadRow;
}

export async function markUploadViewed(uploadId: string): Promise<{ id: string }> {
  assertUuid("uploadId", uploadId);
  const { supabase, user } = await requireUser();

  const nowIso = isoNow();

  const { data, error } = await supabase
    .from("uploads")
    .update({ viewed_at: nowIso })
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .is("viewed_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { id: (data?.id as string) ?? uploadId };
}

export async function listUploadsForClient(clientId: string): Promise<UploadRow[]> {
  assertUuid("clientId", clientId);
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      [
        "id",
        "client_id",
        "submission_session_id",
        "document_request_id",
        "original_filename",
        "storage_key",
        "mime_type",
        "size_bytes",
        "status",
        "denial_reason",
        "uploaded_at",
        "viewed_at",
        "reviewed_at",
        "deleted_at",
        "delete_after_at",
      ].join(",")
    )
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as UploadRow[];
}

/**
 * Used by /clients page "New" badge.
 * Returns client IDs that have PENDING uploads not yet viewed in the inbox.
 */
export async function listClientIdsWithUnseenPendingUploads(): Promise<Set<string>> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select("client_id")
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .is("deleted_at", null)
    .is("viewed_at", null);

  if (error) throw new Error(error.message);

  const set = new Set<string>();
  for (const r of data ?? []) {
    const id = (r as { client_id?: unknown }).client_id;
    if (typeof id === "string" && id) set.add(id);
  }
  return set;
}

/** Inbox page: sessions that still have pending uploads */
export type InboxSessionRow = {
  session_id: string;
  client_id: string;
  client: { name: string | null; email: string | null } | null;
  session: { status: SessionStatus | null; opened_at: string | null } | null;
  pending_total: number;
  pending_new: number;
  last_uploaded_at: string | null;
};

export async function listInboxSessions(): Promise<InboxSessionRow[]> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      `
      submission_session_id,
      client_id,
      viewed_at,
      uploaded_at,
      clients:clients ( name, email ),
      submission_sessions:submission_sessions ( status, opened_at )
    `
    )
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const bySession = new Map<
    string,
    Omit<InboxSessionRow, "session_id"> & { last_uploaded_at: string | null }
  >();

  for (const row of data ?? []) {
    const r = row as unknown as {
      submission_session_id: string | null;
      client_id: string;
      viewed_at: string | null;
      uploaded_at: string | null;
      clients:
        | { name: string | null; email: string | null }
        | { name: string | null; email: string | null }[]
        | null;
      submission_sessions:
        | { status: SessionStatus; opened_at: string | null }
        | { status: SessionStatus; opened_at: string | null }[]
        | null;
    };

    const sid = r.submission_session_id;
    if (!sid) continue;

    const clientOne = normalizeOne(r.clients);
    const sessionOne = normalizeOne(r.submission_sessions);

    const cur =
      bySession.get(sid) ??
      ({
        client_id: r.client_id,
        client: clientOne,
        session: sessionOne
          ? { status: sessionOne.status ?? null, opened_at: sessionOne.opened_at ?? null }
          : null,
        pending_total: 0,
        pending_new: 0,
        last_uploaded_at: null,
      } satisfies Omit<InboxSessionRow, "session_id">);

    cur.pending_total += 1;
    if (!r.viewed_at) cur.pending_new += 1;

    if (r.uploaded_at && (!cur.last_uploaded_at || r.uploaded_at > cur.last_uploaded_at)) {
      cur.last_uploaded_at = r.uploaded_at;
    }

    if (!cur.client && clientOne) cur.client = clientOne;
    if (!cur.session && sessionOne)
      cur.session = { status: sessionOne.status ?? null, opened_at: sessionOne.opened_at ?? null };

    bySession.set(sid, cur);
  }

  return Array.from(bySession.entries())
    .map(([session_id, v]) => ({ session_id, ...v }))
    .sort((a, b) => {
      const ax = a.last_uploaded_at ?? a.session?.opened_at ?? "";
      const bx = b.last_uploaded_at ?? b.session?.opened_at ?? "";
      return bx.localeCompare(ax);
    });
}

/** ✅ NEW: Overall inbox "Approved (72h)" view */
export type ApprovedInboxSessionRow = {
  session_id: string;
  client_id: string;
  client: { name: string | null; email: string | null } | null;
  session: { status: SessionStatus | null; opened_at: string | null } | null;
  accepted_total: number;
  last_reviewed_at: string | null;
  expires_at: string | null; // soonest expiry across accepted files in the session
};

export async function listApprovedInboxSessions(): Promise<ApprovedInboxSessionRow[]> {
  const { supabase, user } = await requireUser();
  const nowIso = isoNow();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      `
      submission_session_id,
      client_id,
      reviewed_at,
      delete_after_at,
      clients:clients ( name, email ),
      submission_sessions:submission_sessions ( status, opened_at )
    `
    )
    .eq("user_id", user.id)
    .eq("status", "ACCEPTED")
    .is("deleted_at", null)
    .gt("delete_after_at", nowIso);

  if (error) throw new Error(error.message);

  const bySession = new Map<
    string,
    Omit<ApprovedInboxSessionRow, "session_id"> & {
      accepted_total: number;
      last_reviewed_at: string | null;
      expires_at: string | null;
    }
  >();

  for (const row of data ?? []) {
    const r = row as unknown as {
      submission_session_id: string | null;
      client_id: string;
      reviewed_at: string | null;
      delete_after_at: string | null;
      clients:
        | { name: string | null; email: string | null }
        | { name: string | null; email: string | null }[]
        | null;
      submission_sessions:
        | { status: SessionStatus; opened_at: string | null }
        | { status: SessionStatus; opened_at: string | null }[]
        | null;
    };

    const sid = r.submission_session_id;
    if (!sid) continue;

    const clientOne = normalizeOne(r.clients);
    const sessionOne = normalizeOne(r.submission_sessions);

    const cur =
      bySession.get(sid) ??
      ({
        client_id: r.client_id,
        client: clientOne,
        session: sessionOne
          ? { status: sessionOne.status ?? null, opened_at: sessionOne.opened_at ?? null }
          : null,
        accepted_total: 0,
        last_reviewed_at: null,
        expires_at: null,
      } satisfies Omit<ApprovedInboxSessionRow, "session_id"> & {
        accepted_total: number;
        last_reviewed_at: string | null;
        expires_at: string | null;
      });

    cur.accepted_total += 1;

    if (r.reviewed_at && (!cur.last_reviewed_at || r.reviewed_at > cur.last_reviewed_at)) {
      cur.last_reviewed_at = r.reviewed_at;
    }

    // conservative: soonest expiry across accepted files
    if (r.delete_after_at && (!cur.expires_at || r.delete_after_at < cur.expires_at)) {
      cur.expires_at = r.delete_after_at;
    }

    if (!cur.client && clientOne) cur.client = clientOne;
    if (!cur.session && sessionOne)
      cur.session = { status: sessionOne.status ?? null, opened_at: sessionOne.opened_at ?? null };

    bySession.set(sid, cur);
  }

  return Array.from(bySession.entries())
    .map(([session_id, v]) => ({ session_id, ...v }))
    .sort((a, b) => {
      const ax = a.last_reviewed_at ?? a.session?.opened_at ?? "";
      const bx = b.last_reviewed_at ?? b.session?.opened_at ?? "";
      return bx.localeCompare(ax);
    });
}

export type InboxClientPendingRow = {
  client_id: string;
  pending_total: number;
  pending_new: number;
  client: { name: string | null; email: string | null } | null;
};

export async function listInboxClientsWithPendingCounts(): Promise<InboxClientPendingRow[]> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      `
      client_id,
      viewed_at,
      clients:clients ( name, email )
    `
    )
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const byClient = new Map<
    string,
    { pending_total: number; pending_new: number; client: { name: string | null; email: string | null } | null }
  >();

  for (const row of data ?? []) {
    const r = row as unknown as {
      client_id: string;
      viewed_at: string | null;
      clients:
        | { name: string | null; email: string | null }
        | { name: string | null; email: string | null }[]
        | null;
    };

    if (!r.client_id) continue;

    const cur = byClient.get(r.client_id) ?? {
      pending_total: 0,
      pending_new: 0,
      client: null as { name: string | null; email: string | null } | null,
    };

    cur.pending_total += 1;
    if (!r.viewed_at) cur.pending_new += 1;

    const c = normalizeOne(r.clients);
    if (!cur.client && c) cur.client = c;

    byClient.set(r.client_id, cur);
  }

  return Array.from(byClient.entries()).map(([client_id, v]) => ({
    client_id,
    pending_total: v.pending_total,
    pending_new: v.pending_new,
    client: v.client,
  }));
}

/**
 * Client inbox route: list ALL sessions for this client that still have PENDING uploads.
 */
export type ClientReviewSessionRow = {
  session_id: string;
  status: SessionStatus | null;
  opened_at: string | null;
  last_uploaded_at: string | null;
  pending_total: number;
  pending_new: number;
};

export async function listReviewSessionsForClient(clientId: string): Promise<ClientReviewSessionRow[]> {
  assertUuid("clientId", clientId);
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      `
      submission_session_id,
      viewed_at,
      uploaded_at,
      submission_sessions:submission_sessions ( status, opened_at )
    `
    )
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .eq("status", "PENDING")
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const bySession = new Map<
    string,
    { status: SessionStatus | null; opened_at: string | null; last_uploaded_at: string | null; pending_total: number; pending_new: number }
  >();

  for (const row of data ?? []) {
    const r = row as unknown as {
      submission_session_id: string | null;
      viewed_at: string | null;
      uploaded_at: string | null;
      submission_sessions:
        | { status: SessionStatus; opened_at: string | null }
        | { status: SessionStatus; opened_at: string | null }[]
        | null;
    };

    const sid = r.submission_session_id;
    if (!sid) continue;

    const sess = normalizeOne(r.submission_sessions);

    const cur = bySession.get(sid) ?? {
      status: sess?.status ?? null,
      opened_at: sess?.opened_at ?? null,
      last_uploaded_at: null as string | null,
      pending_total: 0,
      pending_new: 0,
    };

    cur.pending_total += 1;
    if (!r.viewed_at) cur.pending_new += 1;

    if (r.uploaded_at && (!cur.last_uploaded_at || r.uploaded_at > cur.last_uploaded_at)) {
      cur.last_uploaded_at = r.uploaded_at;
    }

    if (!cur.status && sess?.status) cur.status = sess.status;
    if (!cur.opened_at && sess?.opened_at) cur.opened_at = sess.opened_at;

    bySession.set(sid, cur);
  }

  return Array.from(bySession.entries())
    .map(([session_id, v]) => ({
      session_id,
      status: v.status,
      opened_at: v.opened_at,
      last_uploaded_at: v.last_uploaded_at,
      pending_total: v.pending_total,
      pending_new: v.pending_new,
    }))
    .sort((a, b) => {
      const ax = a.last_uploaded_at ?? a.opened_at ?? "";
      const bx = b.last_uploaded_at ?? b.opened_at ?? "";
      return bx.localeCompare(ax);
    });
}

/**
 * Client inbox route: list sessions for this client that have ACCEPTED uploads still within retention.
 */
export type ClientApprovedSessionRow = {
  session_id: string;
  status: SessionStatus | null;
  opened_at: string | null;
  last_reviewed_at: string | null;
  expires_at: string | null; // soonest expiry across accepted files in this session
  accepted_total: number;
};

export async function listApprovedSessionsForClient(clientId: string): Promise<ClientApprovedSessionRow[]> {
  assertUuid("clientId", clientId);
  const { supabase, user } = await requireUser();

  const nowIso = isoNow();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      `
      submission_session_id,
      reviewed_at,
      delete_after_at,
      submission_sessions:submission_sessions ( status, opened_at )
    `
    )
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .eq("status", "ACCEPTED")
    .is("deleted_at", null)
    .gt("delete_after_at", nowIso);

  if (error) throw new Error(error.message);

  const bySession = new Map<
    string,
    { status: SessionStatus | null; opened_at: string | null; last_reviewed_at: string | null; expires_at: string | null; accepted_total: number }
  >();

  for (const row of data ?? []) {
    const r = row as unknown as {
      submission_session_id: string | null;
      reviewed_at: string | null;
      delete_after_at: string | null;
      submission_sessions:
        | { status: SessionStatus; opened_at: string | null }
        | { status: SessionStatus; opened_at: string | null }[]
        | null;
    };

    const sid = r.submission_session_id;
    if (!sid) continue;

    const sess = normalizeOne(r.submission_sessions);

    const cur = bySession.get(sid) ?? {
      status: sess?.status ?? null,
      opened_at: sess?.opened_at ?? null,
      last_reviewed_at: null as string | null,
      expires_at: null as string | null,
      accepted_total: 0,
    };

    cur.accepted_total += 1;

    if (r.reviewed_at && (!cur.last_reviewed_at || r.reviewed_at > cur.last_reviewed_at)) {
      cur.last_reviewed_at = r.reviewed_at;
    }

    if (r.delete_after_at && (!cur.expires_at || r.delete_after_at < cur.expires_at)) {
      cur.expires_at = r.delete_after_at;
    }

    if (!cur.status && sess?.status) cur.status = sess.status;
    if (!cur.opened_at && sess?.opened_at) cur.opened_at = sess.opened_at;

    bySession.set(sid, cur);
  }

  return Array.from(bySession.entries())
    .map(([session_id, v]) => ({
      session_id,
      status: v.status,
      opened_at: v.opened_at,
      last_reviewed_at: v.last_reviewed_at,
      expires_at: v.expires_at,
      accepted_total: v.accepted_total,
    }))
    .sort((a, b) => {
      const ax = a.last_reviewed_at ?? a.opened_at ?? "";
      const bx = b.last_reviewed_at ?? b.opened_at ?? "";
      return bx.localeCompare(ax);
    });
}

/** Inbox session page: list uploads still pending review for this session */
export type PendingSessionUploadRow = {
  id: string;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string | null;
  viewed_at: string | null;
};

export async function listPendingUploadsForSession(sessionId: string): Promise<{
  client: { id: string; name: string };
  session: { id: string; opened_at: string | null };
  uploads: PendingSessionUploadRow[];
}> {
  assertUuid("sessionId", sessionId);
  const { supabase, user } = await requireUser();

  const { data: sessionRow, error: sessErr } = await supabase
    .from("submission_sessions")
    .select("id,client_id,opened_at")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessErr) throw new Error(sessErr.message);

  const clientId = (sessionRow as { client_id: string }).client_id;

  const { data: clientRow, error: cErr } = await supabase
    .from("clients")
    .select("id,name")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();

  if (cErr) throw new Error(cErr.message);

  const { data: uploads, error: upErr } = await supabase
    .from("uploads")
    .select("id,original_filename,mime_type,size_bytes,uploaded_at,viewed_at")
    .eq("submission_session_id", sessionId)
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false, nullsFirst: false });

  if (upErr) throw new Error(upErr.message);

  return {
    client: { id: (clientRow as { id: string }).id, name: (clientRow as { name: string }).name },
    session: { id: (sessionRow as { id: string }).id, opened_at: (sessionRow as { opened_at: string | null }).opened_at },
    uploads: (uploads ?? []) as unknown as PendingSessionUploadRow[],
  };
}

/**
 * Review an upload (enforces "no re-decide")
 * NOTE: Your DB trigger now sets reviewed_at + delete_after_at for ACCEPTED (72h),
 * so this keeps a minimal patch and leaves delete_after_at to the DB.
 */
export async function reviewUpload(input: {
  uploadId: string;
  status: "ACCEPTED" | "DENIED";
  denial_reason?: string | null;
}): Promise<{ id: string }> {
  assertUuid("uploadId", input.uploadId);
  const { supabase, user } = await requireUser();

  const { data: current, error: curErr } = await supabase
    .from("uploads")
    .select("id,status")
    .eq("id", input.uploadId)
    .eq("user_id", user.id)
    .single();

  if (curErr) throw new Error(curErr.message);

  const curStatus = (current as { status: UploadStatus }).status;
  if (curStatus !== "PENDING") {
    throw new Error("Upload has already been reviewed and cannot be changed");
  }

  const patch: Record<string, unknown> = {
    status: input.status,
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

  if (error) throw new Error(error.message);
  return { id: (data as { id: string }).id };
}

/**
 * Download/view helper used by the API route to sign URLs.
 * - checks ownership via RLS
 * - enforces delete_after_at retention
 * - marks viewed_at
 */
export async function getUploadForDownload(uploadId: string): Promise<{
  storage_key: string;
  mime_type: string | null;
  filename: string;
}> {
  assertUuid("uploadId", uploadId);
  const { supabase, user } = await requireUser();

  const { data: upload, error } = await supabase
    .from("uploads")
    .select("id,storage_key,mime_type,status,deleted_at,delete_after_at,original_filename,viewed_at")
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .single();

  if (error) throw new Error(error.message);

  const u = upload as unknown as {
    id: string;
    storage_key: string | null;
    mime_type: string | null;
    status: UploadStatus;
    deleted_at: string | null;
    delete_after_at: string | null;
    original_filename: string;
    viewed_at: string | null;
  };

  if (u.deleted_at) throw new Error("Upload deleted");
  if (!u.storage_key) throw new Error("Upload not ready (missing storage key)");

  if (u.delete_after_at) {
    const nowIso = isoNow();
    if (u.delete_after_at <= nowIso) throw new Error("Upload expired");
  }

  if (!u.viewed_at) {
    const { error: viewErr } = await supabase
      .from("uploads")
      .update({ viewed_at: isoNow() })
      .eq("id", u.id)
      .eq("user_id", user.id)
      .is("viewed_at", null);

    void viewErr;
  }

  return {
    storage_key: u.storage_key,
    mime_type: u.mime_type,
    filename: safeFilename(u.original_filename),
  };
}

/** Session summary for review-complete page */
export type SessionReviewFileRow = {
  upload_id: string;
  document_request_id: string | null;
  status: UploadStatus;
  original_filename: string;
  mime_type: string | null;
  uploaded_at: string | null;
  reviewed_at: string | null;
  denial_reason: string | null;
  delete_after_at: string | null;
  document_title: string | null;
};

export async function getSessionReviewSummary(sessionId: string): Promise<{
  session: { id: string; status: SessionStatus; opened_at: string | null; finalized_at: string | null };
  client: { id: string; name: string };
  hasPending: boolean;
  accepted: SessionReviewFileRow[];
  denied: SessionReviewFileRow[];
}> {
  assertUuid("sessionId", sessionId);
  const { supabase, user } = await requireUser();

  const { data: sessionRow, error: sessErr } = await supabase
    .from("submission_sessions")
    .select("id,status,opened_at,finalized_at,client_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessErr) throw new Error(sessErr.message);

  const clientId = (sessionRow as { client_id: string }).client_id;

  const { data: clientRow, error: cErr } = await supabase
    .from("clients")
    .select("id,name")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();

  if (cErr) throw new Error(cErr.message);

  const { data: uploads, error: upErr } = await supabase
    .from("uploads")
    .select(
      `
      id,
      document_request_id,
      status,
      original_filename,
      mime_type,
      uploaded_at,
      reviewed_at,
      denial_reason,
      delete_after_at,
      document_requests:document_requests ( title )
    `
    )
    .eq("submission_session_id", sessionId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: true });

  if (upErr) throw new Error(upErr.message);

  const rows: SessionReviewFileRow[] = (uploads ?? []).map((r) => {
    const rr = r as unknown as {
      id: string;
      document_request_id: string | null;
      status: UploadStatus;
      original_filename: string;
      mime_type: string | null;
      uploaded_at: string | null;
      reviewed_at: string | null;
      denial_reason: string | null;
      delete_after_at: string | null;
      document_requests:
        | { title: string | null }
        | { title: string | null }[]
        | null;
    };

    const doc = normalizeOne(rr.document_requests);

    return {
      upload_id: rr.id,
      document_request_id: rr.document_request_id ?? null,
      status: rr.status,
      original_filename: rr.original_filename,
      mime_type: rr.mime_type,
      uploaded_at: rr.uploaded_at,
      reviewed_at: rr.reviewed_at,
      denial_reason: rr.denial_reason,
      delete_after_at: rr.delete_after_at,
      document_title: doc?.title ?? null,
    };
  });

  const hasPending = rows.some((r) => r.status === "PENDING");
  const accepted = rows.filter((r) => r.status === "ACCEPTED");
  const denied = rows.filter((r) => r.status === "DENIED");

  return {
    session: {
      id: (sessionRow as { id: string }).id,
      status: (sessionRow as { status: SessionStatus }).status,
      opened_at: (sessionRow as { opened_at: string | null }).opened_at,
      finalized_at: (sessionRow as { finalized_at: string | null }).finalized_at,
    },
    client: {
      id: (clientRow as { id: string }).id,
      name: (clientRow as { name: string }).name,
    },
    hasPending,
    accepted,
    denied,
  };
}
