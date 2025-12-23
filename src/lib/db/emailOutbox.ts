// src/lib/db/emailOutbox.ts
import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type OutboxTemplate =
  | "manual_request_link"
  | "replacement_link"
  | "session_finalized_notify"
  | "all_docs_accepted"
  | "due_reminder_14d";

type PostgrestErrorLike = { code?: string | null; message?: string | null };

export async function enqueueEmail(input: {
  toEmail: string;
  template: OutboxTemplate;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  clientId?: string | null;
  submissionSessionId?: string | null;
  runAfterIso?: string | null;
}) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("email_outbox").insert({
    user_id: user.id,
    client_id: input.clientId ?? null,
    submission_session_id: input.submissionSessionId ?? null,
    to_email: input.toEmail,
    template: input.template,
    payload: input.payload,
    idempotency_key: input.idempotencyKey,
    run_after: input.runAfterIso ?? new Date().toISOString(),
    status: "pending",
  });

  if (error) {
    const e = error as unknown as PostgrestErrorLike;
    if (e.code === "23505") return { ok: true, duplicate: true };
    throw error;
  }

  return { ok: true, duplicate: false };
}

export type OutboxRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  submission_session_id: string | null;
  to_email: string;
  template: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed" | "cancelled";
  run_after: string;
  attempt_count: number;
  last_error: string | null;
};

export async function claimPendingEmails(limit = 25): Promise<OutboxRow[]> {
  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("email_outbox")
    .select(
      "id,user_id,client_id,submission_session_id,to_email,template,payload,status,run_after,attempt_count,last_error"
    )
    .eq("status", "pending")
    .lte("run_after", nowIso)
    .order("run_after", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as OutboxRow[];
}

export async function markEmailSent(id: string) {
  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { error } = await admin
    .from("email_outbox")
    .update({
      status: "sent",
      sent_at: nowIso,
      updated_at: nowIso,
      last_error: null,
    })
    .eq("id", id);

  if (error) throw error;
}

type AttemptCountRow = { attempt_count: number | null };

export async function markEmailFailed(id: string, errorMsg: string) {
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("email_outbox")
    .select("attempt_count")
    .eq("id", id)
    .single<AttemptCountRow>();

  if (error) throw error;

  const attempts = Number(data?.attempt_count ?? 0) + 1;

  const { error: updErr } = await admin
    .from("email_outbox")
    .update({
      status: attempts >= 5 ? "failed" : "pending",
      attempt_count: attempts,
      last_error: errorMsg.slice(0, 2000),
      run_after: new Date(Date.now() + attempts * 5 * 60 * 1000).toISOString(),
    })
    .eq("id", id);

  if (updErr) throw updErr;
}
