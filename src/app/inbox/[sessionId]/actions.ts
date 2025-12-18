"use server";

import { redirect } from "next/navigation";
import { markUploadViewed } from "@/lib/db/uploads";

export async function markUploadViewedAction(sessionId: string, uploadId: string) {
  await markUploadViewed(uploadId);
  redirect(`/inbox/${sessionId}`);
}
