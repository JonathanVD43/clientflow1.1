// src/app/inbox/[sessionId]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";
import { assertUuid } from "@/lib/validation/uuid";
import { getSessionReviewSummary } from "@/lib/db/uploads";
import { createSubmissionSessionForClient } from "@/lib/db/submissionSessions";
import { enqueueEmail } from "@/lib/db/emailOutbox";
import { requireUser } from "@/lib/auth/require-user";

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Request failed";
}

function checkbox(formData: FormData, key: string) {
  const v = formData.get(key);
  if (v === null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

type ClientEmailRow = { name: string | null; email: string | null };

export async function requestReplacementsAction(
  sessionId: string,
  formData: FormData
) {
  try {
    assertUuid("sessionId", sessionId);

    const sendEmailNow = checkbox(formData, "send_email_now");

    const summary = await getSessionReviewSummary(sessionId);

    // Only request replacements for DENIED items that have a document_request_id
    const documentRequestIds: string[] = summary.denied
      .map((u) => u.document_request_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (documentRequestIds.length === 0) {
      redirectWithError(
        `/inbox/${sessionId}`,
        "No denied files to request replacements for."
      );
      return;
    }

    const created = await createSubmissionSessionForClient({
      clientId: summary.client.id,
      documentRequestIds,
    });

    if (sendEmailNow) {
      const { supabase, user } = await requireUser();

      const { data: clientRow, error: cErr } = await supabase
        .from("clients")
        .select("name,email")
        .eq("id", summary.client.id)
        .eq("user_id", user.id)
        .single<ClientEmailRow>();

      if (cErr) throw new Error(cErr.message);

      const email = clientRow.email;
      const name = clientRow.name ?? "(client)";
      if (!email) throw new Error("Client has no email address");

      const baseUrl = process.env.APP_BASE_URL;
      if (!baseUrl) throw new Error("Missing APP_BASE_URL");

      const link = `${baseUrl.replace(/\/+$/, "")}/portal/${encodeURIComponent(
        created.public_token
      )}`;

      await enqueueEmail({
        toEmail: email,
        template: "replacement_link",
        payload: { clientName: name, link },
        idempotencyKey: `replacement_link:${created.id}`,
        clientId: summary.client.id,
        submissionSessionId: created.id,
      });
    }

    revalidatePath(`/inbox/${sessionId}`);
    revalidatePath(`/inbox`);

    redirectWithSuccess(
      `/clients/${summary.client.id}?requestToken=${encodeURIComponent(
        created.public_token
      )}`,
      "replacement_link_created"
    );
  } catch (e: unknown) {
    redirectWithError(`/inbox/${sessionId}`, errorMessage(e));
  }
}
