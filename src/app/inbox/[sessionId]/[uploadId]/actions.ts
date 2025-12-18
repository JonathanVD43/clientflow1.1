"use server";

import { redirect } from "next/navigation";
import { markUploadViewed, reviewUpload } from "@/lib/db/uploads";

export async function markSeenAction(sessionId: string, uploadId: string) {
  await markUploadViewed(uploadId);
  redirect(`/inbox/${sessionId}/${uploadId}`);
}

export async function approveUploadAction(sessionId: string, uploadId: string) {
  await reviewUpload({ uploadId, status: "ACCEPTED" });
  redirect(`/inbox/${sessionId}`);
}

export async function denyUploadAction(
  sessionId: string,
  uploadId: string,
  formData: FormData
) {
  const reason = String(formData.get("denial_reason") ?? "").trim();
  await reviewUpload({ uploadId, status: "DENIED", denial_reason: reason });
  redirect(`/inbox/${sessionId}`);
}
