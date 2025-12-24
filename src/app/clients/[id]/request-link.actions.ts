// src/app/clients/[id]/request-link.actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSubmissionSessionForClient } from "@/lib/db/submissionSessions";
import { enqueueEmail } from "@/lib/db/emailOutbox";
import { requireUser } from "@/lib/auth/require-user";
import { extractDueSettings } from "@/lib/forms/validators";

type ClientEmailRow = { name: string | null; email: string | null };

function requireStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

function checkbox(formData: FormData, key: string) {
  const v = formData.get(key);
  if (v === null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

function safeGet(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

// Next.js redirect() throws a special error; let it bubble.
function isNextRedirect(e: unknown) {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function errorMessage(e: unknown) {
  if (typeof e === "object" && e !== null) {
    const code = (e as { code?: unknown }).code;
    const message = (e as { message?: unknown }).message;

    if (code === "23505") return "Could not create request link due to a database uniqueness rule.";
    if (typeof message === "string" && message.trim()) return message;
  }
  return e instanceof Error ? e.message : "Could not create request link";
}

export async function createRequestLinkAction(clientId: string, formData: FormData) {
  const selected = requireStringArray(formData, "document_request_id");
  const sendEmailNow = checkbox(formData, "send_email_now");

  // preserve pane state
  const lib = safeGet(formData, "lib") || "templates";
  const edit = safeGet(formData, "edit") || "templates";

  try {
    // ✅ session-specific due day
    const { due_day_of_month, due_timezone } = extractDueSettings(formData);

    const created = await createSubmissionSessionForClient({
      clientId,
      documentRequestIds: selected,
      dueDayOfMonth: due_day_of_month,
      dueTimeZone: due_timezone,
      sentVia: "manual",
      requestSentAtIso: null,
    });

    revalidatePath(`/clients/${clientId}`);

    if (sendEmailNow) {
      const { supabase, user } = await requireUser();

      const { data: clientRow, error: cErr } = await supabase
        .from("clients")
        .select("name,email")
        .eq("id", clientId)
        .eq("user_id", user.id)
        .single<ClientEmailRow>();

      if (cErr) throw new Error(cErr.message);

      const email = (clientRow?.email ?? "").trim();
      const name = (clientRow?.name ?? "(client)").trim();
      if (!email) throw new Error("Client has no email address");

      const baseUrl = process.env.APP_BASE_URL;
      if (!baseUrl) throw new Error("Missing APP_BASE_URL");

      const link = `${baseUrl.replace(/\/+$/, "")}/portal/${encodeURIComponent(
        created.public_token
      )}`;

      await enqueueEmail({
        toEmail: email,
        template: "manual_request_link",
        payload: { clientName: name, link },
        idempotencyKey: `manual_request_link:${created.id}`,
        clientId,
        submissionSessionId: created.id,
      });
    }

    redirect(
      `/clients/${clientId}?lib=${encodeURIComponent(lib)}&edit=${encodeURIComponent(
        edit
      )}&requestToken=${encodeURIComponent(created.public_token)}&saved=request_link_created`
    );
  } catch (e: unknown) {
    if (isNextRedirect(e)) throw e;
    const msg = errorMessage(e);
    redirect(
      `/clients/${clientId}?lib=${encodeURIComponent(lib)}&edit=${encodeURIComponent(
        edit
      )}&requestError=${encodeURIComponent(msg)}`
    );
  }
}
