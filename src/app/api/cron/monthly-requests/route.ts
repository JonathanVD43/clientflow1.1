// src/app/api/cron/monthly-requests/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type TemplateRow = {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  enabled: boolean;
  silent_auto_send: boolean;
  start_next_month: boolean;
  created_at: string;

  // ✅ NEW
  due_day_of_month: number | null;
};

type ClientRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  active: boolean;
  portal_enabled: boolean;
};

type TemplateDocRow = { document_request_id: string };
type OpenSessionRow = { id: string };
type CreatedSessionRow = { id: string; public_token: string };

function requireCronSecret(req: Request): Response | null {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  if (secret !== expected) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

// YYYY-MM-DD override for local testing: ?today=2026-01-01
function getTodayParts(req: Request) {
  const url = new URL(req.url);
  const todayOverride = url.searchParams.get("today");
  if (todayOverride && /^\d{4}-\d{2}-\d{2}$/.test(todayOverride)) {
    const [y, m, d] = todayOverride.split("-").map((x) => Number(x));
    return { year: y, month1to12: m, day: d };
  }

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
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

function normalizeDueDay(dueDayRaw: unknown, fallback = 25) {
  const n = typeof dueDayRaw === "number" ? dueDayRaw : Number(dueDayRaw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(1, Math.trunc(n)), 31);
}

function nextDueOnForSession(
  dueDay: number | null,
  today: { year: number; month1to12: number; day: number }
) {
  const dd = normalizeDueDay(dueDay ?? 25, 25);

  const todayUtc = makeUtcDate(today.year, today.month1to12, today.day);
  const candidate = makeUtcDate(today.year, today.month1to12, dd);

  let due = candidate;
  if (candidate.getTime() < todayUtc.getTime()) {
    const nextMonth = today.month1to12 === 12 ? 1 : today.month1to12 + 1;
    const nextYear = today.month1to12 === 12 ? today.year + 1 : today.year;
    due = makeUtcDate(nextYear, nextMonth, dd);
  }
  return due.toISOString().slice(0, 10); // YYYY-MM-DD
}

function isSameMonthOrLater(templateCreatedAtIso: string, today: { year: number; month1to12: number }) {
  const d = new Date(templateCreatedAtIso);
  const y = d.getUTCFullYear();
  const m1 = d.getUTCMonth() + 1;
  if (today.year > y) return true;
  if (today.year < y) return false;
  return today.month1to12 >= m1;
}

export async function POST(req: Request) {
  const gate = requireCronSecret(req);
  if (gate) return gate;

  const admin = supabaseAdmin();
  const today = getTodayParts(req);

  if (today.day !== 1) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Not the 1st" });
  }

  const nowIso = new Date().toISOString();

  const baseUrl = process.env.APP_BASE_URL ?? "";
  if (!baseUrl) return NextResponse.json({ error: "Missing APP_BASE_URL" }, { status: 500 });
  const appBase = baseUrl.replace(/\/+$/, "");

  // 1) Load enabled templates (monthly only)
  const { data: templates, error: tErr } = await admin
    .from("request_templates")
    .select("id,user_id,client_id,name,enabled,silent_auto_send,start_next_month,created_at,due_day_of_month")
    .eq("enabled", true)
    .returns<TemplateRow[]>();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const tplList = templates ?? [];
  let createdCount = 0;
  let enqueuedCount = 0;
  let skippedCount = 0;

  for (const tpl of tplList) {
    if (!isSameMonthOrLater(tpl.created_at, { year: today.year, month1to12: today.month1to12 })) {
      skippedCount += 1;
      continue;
    }

    // 2) Load client for this template
    const { data: client, error: cErr } = await admin
      .from("clients")
      .select("id,user_id,name,email,active,portal_enabled")
      .eq("id", tpl.client_id)
      .eq("user_id", tpl.user_id)
      .maybeSingle<ClientRow>();

    if (cErr || !client) {
      skippedCount += 1;
      continue;
    }
    if (!client.active || !client.portal_enabled) {
      skippedCount += 1;
      continue;
    }

    // 3) Prevent duplicate OPEN session for same template
    const { data: openExisting, error: oErr } = await admin
      .from("submission_sessions")
      .select("id")
      .eq("user_id", tpl.user_id)
      .eq("client_id", tpl.client_id)
      .eq("status", "OPEN")
      .eq("request_template_id", tpl.id)
      .maybeSingle<OpenSessionRow>();

    if (oErr) {
      skippedCount += 1;
      continue;
    }
    if (openExisting) {
      skippedCount += 1;
      continue;
    }

    // 4) Load template doc ids
    const { data: tdocs, error: dErr } = await admin
      .from("request_template_document_requests")
      .select("document_request_id")
      .eq("request_template_id", tpl.id)
      .eq("user_id", tpl.user_id)
      .returns<TemplateDocRow[]>();

    if (dErr) {
      skippedCount += 1;
      continue;
    }

    const docIds = (tdocs ?? []).map((r) => r.document_request_id);
    if (docIds.length === 0) {
      skippedCount += 1;
      continue;
    }

    // ✅ due_on derived from TEMPLATE due day (session-specific)
    const due_on = nextDueOnForSession(tpl.due_day_of_month ?? 25, today);

    // 5) Create session (AUTO)
    const { data: session, error: sErr } = await admin
      .from("submission_sessions")
      .insert({
        user_id: tpl.user_id,
        client_id: tpl.client_id,
        status: "OPEN",
        opened_at: nowIso,
        due_on,
        request_template_id: tpl.id,
        sent_via: "auto",
        request_sent_at: nowIso,
      })
      .select("id,public_token")
      .single<CreatedSessionRow>();

    if (sErr || !session?.id || !session.public_token) {
      skippedCount += 1;
      continue;
    }

    createdCount += 1;

    // 6) Attach docs to session
    const joinRows = docIds.map((document_request_id) => ({
      user_id: tpl.user_id,
      client_id: tpl.client_id,
      submission_session_id: session.id,
      document_request_id,
    }));

    const { error: jErr } = await admin
      .from("submission_session_document_requests")
      .insert(joinRows);

    if (jErr) {
      await admin
        .from("submission_sessions")
        .update({ status: "EXPIRED", expires_at: nowIso, updated_at: nowIso })
        .eq("id", session.id);
      skippedCount += 1;
      continue;
    }

    // 7) Auto enqueue email if client has email
    const toEmail = (client.email ?? "").trim();
    if (toEmail) {
      const link = `${appBase}/portal/${encodeURIComponent(session.public_token)}`;

      const periodKey = `${today.year}-${String(today.month1to12).padStart(2, "0")}`;
      const idempotencyKey = `auto_request_link:${tpl.id}:${periodKey}`;

      const { error: eErr } = await admin.from("email_outbox").insert({
        user_id: tpl.user_id,
        client_id: tpl.client_id,
        submission_session_id: session.id,
        to_email: toEmail,
        template: "manual_request_link",
        payload: {
          clientName: client.name ?? "(client)",
          link,
          templateName: tpl.name,
          sentVia: "auto",
        },
        idempotency_key: idempotencyKey,
        run_after: nowIso,
        status: "pending",
      });

      if (!eErr) enqueuedCount += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    created: createdCount,
    enqueued: enqueuedCount,
    skipped: skippedCount,
  });
}
