"use server";

import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";
import { reviewUpload } from "@/lib/db/uploads";

export async function acceptUploadAction(clientId: string, uploadId: string) {
  try {
    await reviewUpload({ uploadId, status: "ACCEPTED" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not accept upload";
    redirectWithError(`/clients/${clientId}/uploads/${uploadId}`, msg);
  }

  redirectWithSuccess(`/clients/${clientId}/uploads/${uploadId}`, "accepted");
}

export async function denyUploadAction(
  clientId: string,
  uploadId: string,
  formData: FormData
) {
  try {
    const denial_reason = String(formData.get("denial_reason") ?? "").trim();
    await reviewUpload({ uploadId, status: "DENIED", denial_reason });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not deny upload";
    redirectWithError(`/clients/${clientId}/uploads/${uploadId}`, msg);
  }

  redirectWithSuccess(`/clients/${clientId}/uploads/${uploadId}`, "denied");
}
