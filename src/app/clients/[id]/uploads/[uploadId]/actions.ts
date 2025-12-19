// src/app/clients/[id]/uploads/[uploadId]/actions.ts
"use server";

import {
  acceptUploadAndRedirect,
  denyUploadAndRedirect,
} from "@/lib/actions/uploadReview";

export async function acceptUploadAction(clientId: string, uploadId: string) {
  return acceptUploadAndRedirect({
    uploadId,
    redirectTo: `/clients/${clientId}/uploads/${uploadId}`,
  });
}

export async function denyUploadAction(
  clientId: string,
  uploadId: string,
  formData: FormData
) {
  return denyUploadAndRedirect({
    uploadId,
    formData,
    redirectTo: `/clients/${clientId}/uploads/${uploadId}`,
  });
}
