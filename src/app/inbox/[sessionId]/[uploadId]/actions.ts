"use server";

import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";
import { reviewUpload } from "@/lib/db/uploads";

export async function acceptUploadAction(sessionId: string, uploadId: string) {
  try {
    await reviewUpload({ uploadId, status: "ACCEPTED" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not accept upload";
    redirectWithError(`/inbox/${sessionId}/${uploadId}`, msg);
  }

  redirectWithSuccess(`/inbox/${sessionId}/${uploadId}`, "accepted");
}

export async function denyUploadAction(
  sessionId: string,
  uploadId: string,
  formData: FormData
) {
  try {
    const denial_reason = String(formData.get("denial_reason") ?? "").trim();
    await reviewUpload({ uploadId, status: "DENIED", denial_reason });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not deny upload";
    redirectWithError(`/inbox/${sessionId}/${uploadId}`, msg);
  }

  redirectWithSuccess(`/inbox/${sessionId}/${uploadId}`, "denied");
}
