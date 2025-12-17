"use server";

import { redirect } from "next/navigation";
import { reviewUpload } from "@/lib/db/uploads";

export async function acceptUploadAction(clientId: string, uploadId: string) {
  await reviewUpload({ uploadId, status: "ACCEPTED" });
  redirect(`/clients/${clientId}/uploads/${uploadId}?saved=accepted`);
}

export async function denyUploadAction(
  clientId: string,
  uploadId: string,
  formData: FormData
) {
  const denial_reason = String(formData.get("denial_reason") ?? "").trim();
  await reviewUpload({ uploadId, status: "DENIED", denial_reason });
  redirect(`/clients/${clientId}/uploads/${uploadId}?saved=denied`);
}
