// src/lib/db/uploads.ts
import { requireUser } from "@/lib/auth/require-user";
import { assertUuid } from "@/lib/validation/uuid";
import { expectSingleId } from "@/lib/db/query-builder";

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

function daysFromNowIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function listUploadsForClient(
  clientId: string
): Promise<UploadRow[]> { 
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
  return (data ?? []) as unknown as UploadRow[];
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
  return data as unknown as UploadRow;
}

export async function markUploadViewed(
  uploadId: string
): Promise<{ id: string }> {
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
  return data?.id ? { id: String(data.id) } : { id: uploadId };
}

export async function reviewUpload(input: {
  uploadId: string;
  status: "ACCEPTED" | "DENIED";
  denial_reason?: string | null;
}): Promise<{ id: string }> {
  assertUuid("uploadId", input.uploadId);

  const { supabase, user } = await requireUser();

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Retention policy:
  // - PENDING (set elsewhere): 30 days from upload create
  // - ACCEPTED: 7 days from acceptance
  // - DENIED: keep metadata for 30 days to support follow-up + re-request UX
  const ACCEPTED_TTL_DAYS = 7;
  const DENIED_TTL_DAYS = 30;

  const acceptedDeleteAfterIso = new Date(
    now + ACCEPTED_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const deniedDeleteAfterIso = new Date(
    now + DENIED_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const patch: Record<string, unknown> = {
    status: input.status,
    reviewed_at: nowIso,
  };

  if (input.status === "DENIED") {
    const reason = String(input.denial_reason ?? "").trim();
    if (!reason) throw new Error("Denial reason is required");
    patch.denial_reason = reason;

    // ✅ Keep metadata around long enough for end-of-review + email drafting.
    patch.delete_after_at = deniedDeleteAfterIso;
  } else {
    patch.denial_reason = null;

    // accepted files hang around for a week
    patch.delete_after_at = acceptedDeleteAfterIso;
  }

  return expectSingleId(
    supabase
      .from("uploads")
      .update(patch)
      .eq("id", input.uploadId)
      .eq("user_id", user.id)
      .select("id")
      .single(),
    "Review update failed"
  );
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
    uploads: (uploads ?? []) as unknown as InboxUploadRow[],
  };
}

export async function createSignedDownloadUrl(uploadId: string): Promise<{
  url: string;
  mime_type: string | null;
  original_filename: string;
}> {
  assertUuid("uploadId", uploadId);

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select("id,storage_key,mime_type,original_filename,delete_after_at")
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (error) throw error;

  const storageKey = String(
    (data as { storage_key?: unknown })?.storage_key ?? ""
  ).trim();
  if (!storageKey) throw new Error("Upload is missing storage_key");

  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET ?? "client_uploads";

  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storageKey, 60 * 10); // 10 min

  if (signErr) throw signErr;
  if (!signed?.signedUrl) throw new Error("Could not create signed URL");

  // Policy: once downloaded, shorten retention to 72 hours (but don't extend it)
  try {
    const now = Date.now();
    const seventyTwoHours = now + 72 * 60 * 60 * 1000;

    const existing = (data as { delete_after_at?: string | null })
      .delete_after_at;
    const existingMs = existing ? Date.parse(existing) : NaN;

    const newDeleteAfterMs =
      Number.isFinite(existingMs) && existingMs > 0
        ? Math.min(existingMs, seventyTwoHours)
        : seventyTwoHours;

    await supabase
      .from("uploads")
      .update({
        downloaded_at: new Date(now).toISOString(),
        delete_after_at: new Date(newDeleteAfterMs).toISOString(),
      })
      .eq("id", uploadId)
      .eq("user_id", user.id);
  } catch {
    // Best-effort: download link should still work even if retention update fails.
  }

  return {
    url: signed.signedUrl,
    mime_type: (data as { mime_type?: string | null }).mime_type ?? null,
    original_filename: String(
      (data as { original_filename?: unknown }).original_filename ?? ""
    ),
  };
}

export async function listInboxClientsWithPendingCounts(): Promise<
  Array<{
    client_id: string;
    pending_total: number;
    pending_new: number;
    client: { id: string; name: string | null; email: string | null } | null;
  }>
> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select("client_id, viewed_at")
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .is("deleted_at", null);

  if (error) throw error;

  const byClient = new Map<
    string,
    { client_id: string; pending_total: number; pending_new: number }
  >();

  for (const row of data ?? []) {
    const cid = String((row as { client_id?: unknown }).client_id ?? "");
    if (!cid) continue;

    const cur = byClient.get(cid) ?? {
      client_id: cid,
      pending_total: 0,
      pending_new: 0,
    };

    cur.pending_total += 1;
    if (!(row as { viewed_at?: unknown }).viewed_at) cur.pending_new += 1;

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

  const clientMap = new Map(
    (clients ?? []).map((c) => [String((c as { id?: unknown }).id), c])
  );

  return clientIds
    .map((id) => ({
      client: (clientMap.get(id) ?? null) as {
        id: string;
        name: string | null;
        email: string | null;
      } | null,
      ...byClient.get(id)!,
    }))
    .filter((x) => x.client);
}

export type ClientReviewSessionRow = {
  session_id: string;
  status: "OPEN" | "FINALIZED" | "EXPIRED" | string;
  opened_at: string | null;
  finalized_at: string | null;
  pending_total: number;
  pending_new: number;
  last_uploaded_at: string | null;
};

type UploadSessionJoinRow2 = {
  uploaded_at: string | null;
  viewed_at: string | null;
  submission_session: {
    id: string;
    status: "OPEN" | "FINALIZED" | "EXPIRED" | string;
    opened_at: string | null;
    finalized_at: string | null;
  } | null;
};

export async function listReviewSessionsForClient(
  clientId: string
): Promise<ClientReviewSessionRow[]> {
  assertUuid("clientId", clientId);

  const { supabase, user } = await requireUser();

  // We only care about sessions that still have PENDING uploads (review queue)
  const { data, error } = await supabase
    .from("uploads")
    .select(
      `
      uploaded_at,
      viewed_at,
      submission_session:submission_sessions (
        id,
        status,
        opened_at,
        finalized_at
      )
    `
    )
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .eq("status", "PENDING")
    .is("deleted_at", null)
    .not("uploaded_at", "is", null)
    .not("submission_session_id", "is", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as unknown as UploadSessionJoinRow2[];

  const map = new Map<string, ClientReviewSessionRow>();

  for (const r of rows) {
    const s = r.submission_session;
    if (!s?.id) continue;

    // Only show sessions that are still meaningful to review
    if (s.status !== "OPEN" && s.status !== "FINALIZED") continue;

    const cur =
      map.get(s.id) ??
      ({
        session_id: s.id,
        status: s.status,
        opened_at: s.opened_at ?? null,
        finalized_at: s.finalized_at ?? null,
        pending_total: 0,
        pending_new: 0,
        last_uploaded_at: null,
      } satisfies ClientReviewSessionRow);

    cur.pending_total += 1;
    if (r.viewed_at == null) cur.pending_new += 1;

    const up = r.uploaded_at ? Date.parse(r.uploaded_at) : NaN;
    const last = cur.last_uploaded_at ? Date.parse(cur.last_uploaded_at) : NaN;
    if (!Number.isNaN(up) && (Number.isNaN(last) || up > last)) {
      cur.last_uploaded_at = r.uploaded_at ?? null;
    }

    map.set(s.id, cur);
  }

  // sort newest activity first
  return Array.from(map.values()).sort((a, b) => {
    const ta = a.last_uploaded_at ? Date.parse(a.last_uploaded_at) : 0;
    const tb = b.last_uploaded_at ? Date.parse(b.last_uploaded_at) : 0;
    return tb - ta;
  });
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
      "id,client_id,document_request_id,original_filename,mime_type,size_bytes,status,denial_reason,uploaded_at,viewed_at,reviewed_at,storage_key"
    )
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  return { client, uploads: uploads ?? [] };
}

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

  if (error) throw error;

  return new Set(
    (data ?? []).map((r) =>
      String((r as { client_id?: unknown }).client_id ?? "")
    )
  );
}

/**
 * Used by /inbox/client/[clientId] to jump to the user's current *reviewable* session for that client.
 *
 * IMPORTANT:
 * - Portal uses OPEN for "still uploading"
 * - Once all requested docs are uploaded, the portal-session becomes FINALIZED (so the link is consumed)
 * - The user must still be able to review PENDING uploads in that FINALIZED session
 */
type UploadSessionJoinRow = {
  submission_session_id: string | null;
  uploaded_at: string | null;
  submission_session: {
    id: string;
    status: "OPEN" | "FINALIZED" | "EXPIRED" | string;
    client_id: string;
  } | null;
};

export async function getActiveReviewSessionIdForClient(
  clientId: string
): Promise<string | null> {
  assertUuid("clientId", clientId);

  const { supabase, user } = await requireUser();

  // Find the most recent session for this client that has at least one PENDING uploaded item.
  // We deliberately allow session.status = FINALIZED because that's the normal "ready for review" state.
  const { data, error } = await supabase
    .from("uploads")
    .select(
      `
      submission_session_id,
      uploaded_at,
      submission_session:submission_sessions (
        id,
        status,
        client_id
      )
    `
    )
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .eq("status", "PENDING")
    .is("deleted_at", null)
    .not("uploaded_at", "is", null)
    .not("submission_session_id", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(25);

  if (error) throw error;

  const rows = (data ?? []) as unknown as UploadSessionJoinRow[];

  for (const r of rows) {
    const s = r.submission_session;
    if (!s?.id) continue;
    if (s.client_id !== clientId) continue;

    if (s.status === "OPEN" || s.status === "FINALIZED") {
      return s.id;
    }
  }

  return null;
}

/**
 * Legacy helper (kept for now to avoid breaking imports elsewhere).
 * Prefer getActiveReviewSessionIdForClient().
 */
export async function getOpenSessionIdForClient(
  clientId: string
): Promise<string | null> {
  assertUuid("clientId", clientId);

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
  return data?.id ? String((data as { id?: unknown }).id) : null;
}
