import { NextResponse } from "next/server";
import { claimPendingEmails, markEmailFailed, markEmailSent } from "@/lib/db/emailOutbox";
import { renderTemplate } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/resend";

function authCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allow in dev if unset
  const got = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  return got === secret;
}

export async function POST(req: Request) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = Number(new URL(req.url).searchParams.get("limit") ?? "25");

  const rows = await claimPendingEmails(Number.isFinite(limit) ? limit : 25);

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const tpl = renderTemplate(row.template as any, row.payload ?? {});
      await sendEmail({
        to: row.to_email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
      await markEmailSent(row.id);
      sent += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      await markEmailFailed(row.id, msg);
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed: rows.length, sent, failed });
}
