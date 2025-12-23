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

type ExistingOpenSessionRow = {
  id: string;
  status: "OPEN";
  public_token: string;
  opened_at: string | null;
  due_on: string | null;
};

function partsInTimeZone(timeZone: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month1to12: Number(parts.month),
    day: Number(parts.day),
  };
}

function lastDayOfMonthUtc(y: number, m1: number) {
  return new Date(Date.UTC(y, m1, 0)).getUTCDate();
}

function makeUtcDate(y: number, m1: number, d: number) {
  const last = lastDayOfMonthUtc(y, m1);
  const clamped = Math.min(Math.max(1, d), last);
  return new Date(Date.UTC(y, m1 - 1, clamped, 0, 0, 0));
}

function nextDueDateIso(dueDay: number, timeZone = "Africa/Johannesburg") {
  const { year, month1to12, day } = partsInTimeZone(timeZone);

  const today = makeUtcDate(year, month1to12, day);
  const candidate = makeUtcDate(year, month1to12, dueDay);

  let due = candidate;
  if (candidate.getTime() < today.getTime()) {
    const nextMonth = month1to12 === 12 ? 1 : month1to12 + 1;
    const nextYear = month1to12 === 12 ? year + 1 : year;
    due = makeUtcDate(nextYear, nextMonth, dueDay);
  }

  return due.toISOString().slice(0, 10); // YYYY-MM-DD
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

  // 1) Ensure client belongs to user + get due_day_of_month
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select("id,due_day_of_month")
    .eq("id", input.clientId)
    .eq("user_id", user.id)
    .single<ClientDueRow>();

  if (cErr) throw cErr;
  if (!client) throw new Error("Client not found");

  // 2) Block creation if there is already an OPEN session for this client.
  // Sessions must be closed by FINALIZED (all uploads completed) or EXPIRED (due date reached).
  const { data: existingOpen, error: openErr } = await supabase
    .from("submission_sessions")
    .select("id,status,public_token,opened_at,due_on")
    .eq("user_id", user.id)
    .eq("client_id", input.clientId)
    .eq("status", "OPEN")
    .maybeSingle<ExistingOpenSessionRow>();

  if (openErr) throw openErr;
  if (existingOpen) {
    throw new Error(
      "This client already has an open document request. Please complete it (or let it expire) before creating a new one."
    );
  }

  const dueDay = Number(client.due_day_of_month ?? 25);
  const due_on = nextDueDateIso(dueDay, "Africa/Johannesburg");

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
