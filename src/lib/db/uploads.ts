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

export async function markUploadViewed(
  uploadId: string
): Promise<{ id: string }> {
  assertUuid("uploadId", uploadId);
  const { supabase, user } = await requireUser();

  const nowIso = isoNow();

  // Idempotent: only set if currently null
  const { data, error } = await supabase
    .from("uploads")
    .update({ viewed_at: nowIso })
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .is("viewed_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);

  // If already viewed, still return the id
  return { id: (data?.id as string) ?? uploadId };
}

export async function listUploadsForClient(
  clientId: string
): Promise<UploadRow[]> {
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
    .order("uploaded_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as UploadRow[];
}

/**
 * Used by /clients page "New" badge.
 * Returns client IDs that have PENDING uploads not yet viewed in the inbox.
 */
export async function listClientIdsWithUnseenPendingUploads(): Promise<
  Set<string>
> {
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

/** Inbox page: clients grouped with pending counts */

export type InboxSessionRow = {
  session_id: string;
  client_id: string;
  client: { name: string | null; email: string | null } | null;
  session: {
    status: "OPEN" | "FINALIZED" | "EXPIRED" | null;
    opened_at: string | null;
  } | null;
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
        | { status: "OPEN" | "FINALIZED" | "EXPIRED"; opened_at: string | null }
        | {
            status: "OPEN" | "FINALIZED" | "EXPIRED";
            opened_at: string | null;
          }[]
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
          ? {
              status: sessionOne.status ?? null,
              opened_at: sessionOne.opened_at ?? null,
            }
          : null,
        pending_total: 0,
        pending_new: 0,
        last_uploaded_at: null,
      } satisfies Omit<InboxSessionRow, "session_id">);

    cur.pending_total += 1;
    if (!r.viewed_at) cur.pending_new += 1;

    if (
      r.uploaded_at &&
      (!cur.last_uploaded_at || r.uploaded_at > cur.last_uploaded_at)
    ) {
      cur.last_uploaded_at = r.uploaded_at;
    }

    // keep first non-null header info
    if (!cur.client && clientOne) cur.client = clientOne;
    if (!cur.session && sessionOne)
      cur.session = {
        status: sessionOne.status ?? null,
        opened_at: sessionOne.opened_at ?? null,
      };

    bySession.set(sid, cur);
  }

  return Array.from(bySession.entries())
    .map(([session_id, v]) => ({
      session_id,
      ...v,
    }))
    .sort((a, b) => {
      const ax = a.last_uploaded_at ?? a.session?.opened_at ?? "";
      const bx = b.last_uploaded_at ?? b.session?.opened_at ?? "";
      return bx.localeCompare(ax);
    });
}

export type InboxClientPendingRow = {
  client_id: string;
  pending_total: number;
  pending_new: number;
  client: { name: string | null; email: string | null } | null;
};

export async function listInboxClientsWithPendingCounts(): Promise<
  InboxClientPendingRow[]
> {
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
    {
      pending_total: number;
      pending_new: number;
      client: { name: string | null; email: string | null } | null;
    }
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
 * This fixes “different sessions exist but only most recent shows”.
 */
export type ClientReviewSessionRow = {
  session_id: string;
  status: SessionStatus | null;
  opened_at: string | null;
  last_uploaded_at: string | null;
  pending_total: number;
  pending_new: number;
};

export async function listReviewSessionsForClient(
  clientId: string
): Promise<ClientReviewSessionRow[]> {
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
    {
      status: SessionStatus | null;
      opened_at: string | null;
      last_uploaded_at: string | null;
      pending_total: number;
      pending_new: number;
    }
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

    const ua = r.uploaded_at;
    if (ua && (!cur.last_uploaded_at || ua > cur.last_uploaded_at)) {
      cur.last_uploaded_at = ua;
    }

    // keep latest known session fields
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
    .order("uploaded_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (upErr) throw new Error(upErr.message);

  return {
    client: {
      id: (clientRow as { id: string }).id,
      name: (clientRow as { name: string }).name,
    },
    session: {
      id: (sessionRow as { id: string }).id,
      opened_at: (sessionRow as { opened_at: string | null }).opened_at,
    },
    uploads: (uploads ?? []) as unknown as PendingSessionUploadRow[],
  };
}

/**
 * Enforce “no re-decide” rule.
 * Also applies retention policy:
 * - ACCEPTED: 7 days (but download/view helper can extend to >=72h)
 * - DENIED: 30 days
 */
export async function reviewUpload(input: {
  uploadId: string;
  status: "ACCEPTED" | "DENIED";
  denial_reason?: string | null;
}): Promise<{ id: string }> {
  assertUuid("uploadId", input.uploadId);
  const { supabase, user } = await requireUser();

  // 1) Check current state (no re-decide)
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

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const ACCEPTED_TTL_DAYS = 7;
  const DENIED_TTL_DAYS = 30;

  const acceptedDeleteAfterIso = new Date(
    now + ACCEPTED_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const deniedDeleteAfterIso = new Date(
    now + DENIED_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const patch: {
    status: UploadStatus;
    reviewed_at: string;
    denial_reason: string | null;
    delete_after_at: string;
  } = {
    status: input.status,
    reviewed_at: nowIso,
    denial_reason: null,
    delete_after_at: acceptedDeleteAfterIso,
  };

  if (input.status === "DENIED") {
    const reason = String(input.denial_reason ?? "").trim();
    if (!reason) throw new Error("Denial reason is required");
    patch.denial_reason = reason;
    patch.delete_after_at = deniedDeleteAfterIso;
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
 * Unified download/view helper.
 * - Enforces ownership via RLS by reading with the signed-in user's supabase client.
 * - Uses the service-role/admin client ONLY inside the calling API route (you already do that there).
 *
 * NOTE: This helper does NOT call supabaseAdmin() (keep secrets out of db layer).
 * Instead it returns enough info for the API route to sign.
 *
 * To support your “72-hour access after accept” rule:
 * - If status is ACCEPTED and delete_after_at is sooner than now+72h, we extend it.
 */
export async function createSignedDownloadUrl(input: {
  uploadId: string;
  expiresInSeconds: number;
  download: boolean;
}): Promise<{ signedUrl: string; mime_type: string | null; filename: string }> {
  assertUuid("uploadId", input.uploadId);
  const { supabase, user } = await requireUser();

  // Fetch upload via RLS
  const { data: upload, error } = await supabase
    .from("uploads")
    .select(
      "id,storage_key,mime_type,status,deleted_at,delete_after_at,original_filename"
    )
    .eq("id", input.uploadId)
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
  };

  if (u.deleted_at) throw new Error("Upload deleted");
  if (!u.storage_key) throw new Error("Upload not ready (missing storage key)");

  // 72-hour retention extension for ACCEPTED files
  if (u.status === "ACCEPTED") {
    const minKeepMs = 72 * 60 * 60 * 1000;
    const targetIso = new Date(Date.now() + minKeepMs).toISOString();
    const current = u.delete_after_at;

    if (!current || current < targetIso) {
      const { error: updErr } = await supabase
        .from("uploads")
        .update({ delete_after_at: targetIso })
        .eq("id", u.id)
        .eq("user_id", user.id);

      if (updErr) {
        // Don't block signing on a retention update failure, but do surface it if you want.
        // For now: silent best-effort.
      }
    }
  }

  // IMPORTANT:
  // We do NOT sign here (needs service role).
  // Your API route should call supabaseAdmin().storage.createSignedUrl().
  // This helper is used by the API route you pasted; it expects us to return signedUrl.
  //
  // So: your API route must do the actual signing (as it already does).
  //
  // If you want this helper to *also* sign, we can move signing here and pass admin client in.
  throw new Error(
    "createSignedDownloadUrl must be called from an API route that performs signing with supabaseAdmin(). " +
      "You pasted an API route that expects this helper to return signedUrl; that route should instead sign directly " +
      "or pass a signing function in. Tell me which approach you want."
  );
}

/**
 * Session summary helper (for your “review complete” screen).
 * This returns both ACCEPTED + DENIED + whether anything remains PENDING.
 */
export type SessionReviewFileRow = {
  upload_id: string;
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
  session: {
    id: string;
    status: SessionStatus;
    opened_at: string | null;
    finalized_at: string | null;
  };
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
    .order("created_at", { ascending: true });

  if (upErr) throw new Error(upErr.message);

  const rows: SessionReviewFileRow[] = (uploads ?? []).map((r) => {
    const rr = r as unknown as {
      id: string;
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
      finalized_at: (sessionRow as { finalized_at: string | null })
        .finalized_at,
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
