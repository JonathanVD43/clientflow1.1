// src/lib/actions/uploadReview.ts
"use server";

import { reviewUpload, getSessionReviewSummary } from "@/lib/db/uploads";
import { requireString } from "@/lib/forms/fields";
import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";
import { requireUser } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { enqueueEmail } from "@/lib/db/emailOutbox";

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

async function maybeSendAllAcceptedConfirmation(uploadId: string) {
  const { supabase, user } = await requireUser();

  // Find the session + client for this upload
  const { data: upRow, error: upErr } = await supabase
    .from("uploads")
    .select("submission_session_id,client_id")
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .single<{ submission_session_id: string | null; client_id: string }>();

  if (upErr || !upRow?.submission_session_id) return;

  const sessionId = upRow.submission_session_id;
  const clientId = upRow.client_id;

  // Only send when review is fully complete AND nothing was denied
  const summary = await getSessionReviewSummary(sessionId);
  if (summary.hasPending) return;
  if (summary.denied.length > 0) return;

  // Stamp accepted_confirmation_sent_at exactly once (atomic)
  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: stamped, error: stampErr } = await admin
    .from("submission_sessions")
    .update({ accepted_confirmation_sent_at: nowIso })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .is("accepted_confirmation_sent_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  // If it was already stamped (or update failed), don't email again
  if (stampErr || !stamped?.id) return;

  // Client email
  const { data: clientRow, error: cErr } = await admin
    .from("clients")
    .select("name,email")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle<{ name: string | null; email: string | null }>();

  if (cErr) return;
  const toEmail = clientRow?.email ?? null;
  if (!toEmail) return;

  const clientName = clientRow?.name ?? "your client";

  // You’ll add this template name in templates.ts and emailOutbox types
  const baseUrl = process.env.APP_BASE_URL;
  const link = baseUrl
    ? `${baseUrl.replace(/\/+$/, "")}/portal` // optional; you can remove if you don’t want a link here
    : "";

  await enqueueEmail({
    toEmail,
    template: "all_docs_accepted",
    payload: { clientName, link },
    idempotencyKey: `all_docs_accepted:${sessionId}`,
    clientId,
    submissionSessionId: sessionId,
  });
}

/**
 * Always redirect (never return) — keeps behavior consistent with server actions.
 * redirectTo should be a PATH (e.g. `/inbox/${sessionId}/${uploadId}`), optionally with querystring.
 */
export async function acceptUploadAndRedirect(args: {
  uploadId: string;
  redirectTo: string;
}) {
  try {
    await reviewUpload({ uploadId: args.uploadId, status: "ACCEPTED" });
    await maybeSendAllAcceptedConfirmation(args.uploadId);
  } catch (e) {
    redirectWithError(args.redirectTo, errorMessage(e, "Could not accept upload"));
  }

  redirectWithSuccess(args.redirectTo, "accepted");
}

export async function denyUploadAndRedirect(args: {
  uploadId: string;
  formData: FormData;
  redirectTo: string;
}) {
  try {
    const denial_reason = requireString(
      args.formData,
      "denial_reason",
      "Denial reason is required"
    );

    await reviewUpload({
      uploadId: args.uploadId,
      status: "DENIED",
      denial_reason,
    });

    // If anything is denied, we never send the “all accepted” confirmation, so no check needed.
  } catch (e) {
    redirectWithError(args.redirectTo, errorMessage(e, "Could not deny upload"));
  }

  redirectWithSuccess(args.redirectTo, "denied");
}
