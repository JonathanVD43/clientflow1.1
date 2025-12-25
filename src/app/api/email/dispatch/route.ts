// src/app/api/email/dispatch/route.ts
import { NextResponse } from "next/server";
import {
  claimPendingEmails,
  markEmailFailed,
  markEmailSent,
} from "@/lib/db/emailOutbox";
import { renderTemplate, type EmailTemplateName } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/resend";

function authCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // allow in dev if unset

  const url = new URL(req.url);
  const got =
    req.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  return got === secret;
}

/**
 * We can’t perfectly validate the union at runtime unless the templates module
 * also exports the allowed names. We *can* at least ensure it's a string before
 * passing it to renderTemplate (which should throw for unknown templates).
 */
function coerceTemplateName(value: unknown): EmailTemplateName {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid email template: ${String(value)}`);
  }

  // TypeScript: trust templates module type; runtime correctness handled by renderTemplate throwing.
  return value as EmailTemplateName;
}

export async function POST(req: Request) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) ? limitParam : 25;

  const rows = await claimPendingEmails(limit);

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const templateName = coerceTemplateName(row.template);
      const tpl = renderTemplate(templateName, row.payload ?? {});

      await sendEmail({
        to: row.to_email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });

      await markEmailSent(row.id);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      await markEmailFailed(row.id, message);
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed: rows.length, sent, failed });
}
