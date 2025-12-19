// src/app/inbox/[sessionId]/[uploadId]/actions.ts
"use server";

import {
  acceptUploadAndRedirect,
  denyUploadAndRedirect,
} from "@/lib/actions/uploadReview";

export async function acceptUploadAction(sessionId: string, uploadId: string) {
  return acceptUploadAndRedirect({
    uploadId,
    redirectTo: `/inbox/${sessionId}/${uploadId}`,
  });
}

export async function denyUploadAction(
  sessionId: string,
  uploadId: string,
  formData: FormData
) {
  return denyUploadAndRedirect({
    uploadId,
    formData,
    redirectTo: `/inbox/${sessionId}/${uploadId}`,
  });
}
