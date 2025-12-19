// src/lib/actions/uploadReview.ts
"use server";

import { reviewUpload } from "@/lib/db/uploads";
import { requireString } from "@/lib/forms/fields";
import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
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
  } catch (e) {
    redirectWithError(args.redirectTo, errorMessage(e, "Could not deny upload"));
  }

  redirectWithSuccess(args.redirectTo, "denied");
}
