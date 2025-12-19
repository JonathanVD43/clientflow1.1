// src/app/inbox/[sessionId]/actions.ts
"use server";

import { redirectWithError } from "@/lib/navigation/redirects";
import { redirect } from "next/navigation";
import { markUploadViewed } from "@/lib/db/uploads";

export async function markUploadViewedAction(
  sessionId: string,
  uploadId: string
) {
  try {
    await markUploadViewed(uploadId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not mark upload viewed";
    redirectWithError(`/inbox/${sessionId}`, msg);
  }

  redirect(`/inbox/${sessionId}`);
}
