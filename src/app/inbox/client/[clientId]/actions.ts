"use server";

import { redirect } from "next/navigation";
import { markUploadViewed } from "@/lib/db/uploads";

export async function markUploadViewedAction(clientId: string, uploadId: string) {
  await markUploadViewed(uploadId);
  redirect(`/inbox/client/${clientId}`);
}
