"use server";

import { acceptUploadAndRedirect, denyUploadAndRedirect } from "@/lib/actions/uploadReview";

export async function acceptUploadAction(sessionId: string, uploadId: string) {
  await acceptUploadAndRedirect({
    uploadId,
    redirectTo: `/inbox/${sessionId}/${uploadId}`,
  });
}

export async function denyUploadAction(
  sessionId: string,
  uploadId: string,
  formData: FormData
) {
  await denyUploadAndRedirect({
    uploadId,
    formData,
    redirectTo: `/inbox/${sessionId}/${uploadId}`,
  });
}
