"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSubmissionSessionForClient } from "@/lib/db/submissionSessions";
import { enqueueEmail } from "@/lib/db/emailOutbox";
import { requireUser } from "@/lib/auth/require-user";

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

// Next.js uses a special error for redirect().
// In Next 15, it contains a digest that starts with "NEXT_REDIRECT".
function isNextRedirect(e: unknown) {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function errorMessage(e: unknown) {
  if (typeof e === "object" && e !== null) {
    const code = (e as { code?: unknown }).code;
    const message = (e as { message?: unknown }).message;

    if (code === "23505") {
      return "Could not create request link due to a database uniqueness rule.";
    }

    if (typeof message === "string" && message.trim()) return message;
  }

  return e instanceof Error ? e.message : "Could not create request link";
}

export async function createRequestLinkAction(
  clientId: string,
  formData: FormData
) {
  const selected = requireStringArray(formData, "document_request_id");
  const sendEmailNow = checkbox(formData, "send_email_now");

  try {
    const created = await createSubmissionSessionForClient({
      clientId,
      documentRequestIds: selected,
    });

    revalidatePath(`/clients/${clientId}`);

    if (sendEmailNow) {
      const { supabase, user } = await requireUser();

      const { data: clientRow, error: cErr } = await supabase
        .from("clients")
        .select("name,email")
        .eq("id", clientId)
        .eq("user_id", user.id)
        .single();

      if (cErr) throw new Error(cErr.message);

      const email = (clientRow as any)?.email as string | null;
      const name = ((clientRow as any)?.name as string | null) ?? "(client)";

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

    // ✅ this throws a NEXT_REDIRECT "error" internally
    redirect(
      `/clients/${clientId}?requestToken=${encodeURIComponent(
        created.public_token
      )}`
    );
  } catch (e: unknown) {
    // ✅ IMPORTANT: let Next redirects bubble
    if (isNextRedirect(e)) throw e;

    const msg = errorMessage(e);
    redirect(`/clients/${clientId}?requestError=${encodeURIComponent(msg)}`);
  }
}
