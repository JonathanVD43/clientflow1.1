// src/app/api/cron/reminders-14d/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type SessionDueRow = {
  id: string;
  user_id: string;
  client_id: string;
  public_token: string;
  due_on: string | null; // DATE => "YYYY-MM-DD"
};

type ClientRow = {
  id: string;
  name: string | null;
  email: string | null;
};

type CountHead = { count: number | null };

function requireSecret(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  return Boolean(expected) && secret === expected;
}

function isoDatePlusDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function POST(req: Request) {
  if (!requireSecret(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing APP_BASE_URL" },
      { status: 500 }
    );
  }

  const admin = supabaseAdmin();

  // today + 14 days, as a DATE string in UTC (works with due_on DATE)
  const target = isoDatePlusDays(14);

  // Find sessions due in 14 days that haven't been reminded
  const { data: sessions, error: sErr } = await admin
    .from("submission_sessions")
    .select("id,user_id,client_id,public_token,due_on")
    .eq("status", "OPEN")
    .is("reminder_14d_sent_at", null)
    .eq("due_on", target)
    .returns<SessionDueRow[]>();

  if (sErr) {
    return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  }

  const list = sessions ?? [];
  if (list.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, target_due_on: target });
  }

  let enqueued = 0;
  let skipped = 0;
  let failed = 0;

  for (const s of list) {
    try {
      // Skip if everything is already uploaded for this session:
      // If there are ZERO "missing uploads" (uploads with uploaded_at IS NULL), then don't remind.
      const { count: missingCount, error: missErr } = await admin
        .from("uploads")
        .select("id", { count: "exact", head: true })
        .eq("submission_session_id", s.id)
        .is("deleted_at", null)
        .is("uploaded_at", null)
        .returns<CountHead>();

      if (missErr) throw new Error(missErr.message);

      const missing = Number(missingCount ?? 0);
      if (missing === 0) {
        // Nothing outstanding -> stamp to avoid retry spam
        const { error: updSkipErr } = await admin
          .from("submission_sessions")
          .update({ reminder_14d_sent_at: new Date().toISOString() })
          .eq("id", s.id);

        if (updSkipErr) throw new Error(updSkipErr.message);

        skipped += 1;
        continue;
      }

      // Load client email + name
      const { data: client, error: cErr } = await admin
        .from("clients")
        .select("id,name,email")
        .eq("id", s.client_id)
        .eq("user_id", s.user_id)
        .single<ClientRow>();

      if (cErr) throw new Error(cErr.message);

      const toEmail = (client?.email ?? "").trim();
      if (!toEmail) {
        // no email => mark as "sent" to avoid retry spam, but count as skipped
        const { error: updNoEmailErr } = await admin
          .from("submission_sessions")
          .update({ reminder_14d_sent_at: new Date().toISOString() })
          .eq("id", s.id);

        if (updNoEmailErr) throw new Error(updNoEmailErr.message);

        skipped += 1;
        continue;
      }

      const link = `${baseUrl.replace(/\/+$/, "")}/portal/${encodeURIComponent(
        s.public_token
      )}`;

      const idempotencyKey = `due_reminder_14d:${s.id}`;

      // Insert outbox row (idempotent)
      const { error: insErr } = await admin.from("email_outbox").insert({
        user_id: s.user_id,
        client_id: s.client_id,
        submission_session_id: s.id,
        to_email: toEmail,
        template: "due_reminder_14d",
        payload: {
          clientName: client?.name ?? "(client)",
          link,
          dueOn: s.due_on ?? null,
        },
        idempotency_key: idempotencyKey,
        run_after: new Date().toISOString(),
        status: "pending",
      });

      if (insErr) {
        const code = (insErr as unknown as { code?: string | null }).code ?? null;
        if (code !== "23505") throw new Error(insErr.message);
      }

      // Stamp reminder sent (so only once per session)
      const { error: updErr } = await admin
        .from("submission_sessions")
        .update({ reminder_14d_sent_at: new Date().toISOString() })
        .eq("id", s.id);

      if (updErr) throw new Error(updErr.message);

      enqueued += 1;
    } catch {
      failed += 1;
      // leave it un-stamped so it can retry tomorrow
    }
  }

  return NextResponse.json({
    ok: true,
    processed: list.length,
    enqueued,
    skipped,
    failed,
    target_due_on: target,
  });
}
