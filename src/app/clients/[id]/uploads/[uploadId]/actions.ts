"use server";

import { acceptUploadAndRedirect, denyUploadAndRedirect } from "@/lib/actions/uploadReview";

export async function acceptUploadAction(clientId: string, uploadId: string) {
  await acceptUploadAndRedirect({
    uploadId,
    redirectTo: `/clients/${clientId}/uploads/${uploadId}`,
  });
}

export async function denyUploadAction(
  clientId: string,
  uploadId: string,
  formData: FormData
) {
  await denyUploadAndRedirect({
    uploadId,
    formData,
    redirectTo: `/clients/${clientId}/uploads/${uploadId}`,
  });
}
