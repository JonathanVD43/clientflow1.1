// src/app/inbox/client/[clientId]/actions.ts
"use server";

import { redirectWithError } from "@/lib/navigation/redirects";
import { redirect } from "next/navigation";
import { markUploadViewed } from "@/lib/db/uploads";

export async function markUploadViewedAction(clientId: string, uploadId: string) {
  try {
    await markUploadViewed(uploadId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not mark upload viewed";
    redirectWithError(`/inbox/client/${clientId}`, msg);
  }

  redirect(`/inbox/client/${clientId}`);
}
