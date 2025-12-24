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

type ClientDueRow = {
  id: string;
  due_day_of_month: number | null;
};

type ExistingOpenTemplateSessionRow = {
  id: string;
};

function lastDayOfMonthUtc(y: number, m1: number) {
  return new Date(Date.UTC(y, m1, 0)).getUTCDate();
}

function makeUtcDate(y: number, m1: number, d: number) {
  const last = lastDayOfMonthUtc(y, m1);
  const clamped = Math.min(Math.max(1, d), last);
  return new Date(Date.UTC(y, m1 - 1, clamped, 0, 0, 0));
}

/**
 * Compute the next due date as YYYY-MM-DD.
 * If today is already past dueDay, rolls to next month.
 * Uses UTC calendar math (good enough since due_on is a DATE).
 */
function nextDueDateIso(dueDay: number) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m1 = now.getUTCMonth() + 1;
  const today = makeUtcDate(y, m1, now.getUTCDate());
  const candidate = makeUtcDate(y, m1, dueDay);

  let due = candidate;
  if (candidate.getTime() < today.getTime()) {
    const nextMonth = m1 === 12 ? 1 : m1 + 1;
    const nextYear = m1 === 12 ? y + 1 : y;
    due = makeUtcDate(nextYear, nextMonth, dueDay);
  }

  return due.toISOString().slice(0, 10);
}

type CreateSessionInput = {
  clientId: string;
  documentRequestIds: string[];

  /**
   * If provided, this session is considered template-backed.
   * We enforce "only one OPEN per (client, template)" in code
   * (and SQL unique index enforces it too).
   */
  requestTemplateId?: string | null;

  /**
   * For analytics/filters. DB default is 'manual'.
   */
  sentVia?: "manual" | "auto";

  /**
   * If you want to stamp when the request email was actually sent.
   * Leave null if you're creating the session before sending.
   */
  requestSentAtIso?: string | null;
};

export async function createSubmissionSessionForClient(
  input: CreateSessionInput
): Promise<CreatedSubmissionSession> {
  assertUuid("clientId", input.clientId);

  const ids = uniqStrings(input.documentRequestIds);
  if (ids.length === 0) throw new Error("Select at least one document to request");
  for (const id of ids) assertUuid("documentRequestId", id);

  const requestTemplateId = (input.requestTemplateId ?? null) ? String(input.requestTemplateId) : null;
  if (requestTemplateId) assertUuid("requestTemplateId", requestTemplateId);

  const sentVia: "manual" | "auto" = input.sentVia ?? "manual";
  const requestSentAt = input.requestSentAtIso ?? null;

  const { supabase, user } = await requireUser();

  // 1) Ensure client belongs to user + get due_day_of_month
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select("id,due_day_of_month")
    .eq("id", input.clientId)
    .eq("user_id", user.id)
    .single<ClientDueRow>();

  if (cErr) throw cErr;
  if (!client) throw new Error("Client not found");

  // 2) Allow concurrent sessions per client.
  //    BUT if it's template-backed, enforce only one OPEN session per template for this client.
  if (requestTemplateId) {
    const { data: existingOpen, error: openErr } = await supabase
      .from("submission_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("client_id", input.clientId)
      .eq("status", "OPEN")
      .eq("request_template_id", requestTemplateId)
      .maybeSingle<ExistingOpenTemplateSessionRow>();

    if (openErr) throw openErr;
    if (existingOpen) {
      throw new Error(
        "This request template already has an open session for this client. Please complete it (or let it expire) before creating another."
      );
    }
  }

  const dueDay = Number(client.due_day_of_month ?? 25);
  const due_on = nextDueDateIso(dueDay);

  // 3) Ensure all selected document requests belong to this client + user and are active
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

  // 4) Create the new OPEN session
  const nowIso = new Date().toISOString();

  const { data: session, error: sErr } = await supabase
    .from("submission_sessions")
    .insert({
      user_id: user.id,
      client_id: input.clientId,
      status: "OPEN",
      opened_at: nowIso,
      due_on,
      request_template_id: requestTemplateId,
      sent_via: sentVia,
      request_sent_at: requestSentAt,
      // keep defaults: kind defaults to MANUAL in SQL
    })
    .select("id,public_token,status,opened_at")
    .single<{ id: string; public_token: string; status: string; opened_at: string | null }>();

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
