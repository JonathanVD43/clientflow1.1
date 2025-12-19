// src/lib/actions/uploadReview.ts
"use server";

import { redirect } from "next/navigation";
import { reviewUpload } from "@/lib/db/uploads";
import { requireString } from "@/lib/forms/fields";

/**
 * Always redirect (never return) — keeps behavior consistent with server actions.
 * Pass a full redirect URL (including any querystring you want to preserve).
 */
export async function acceptUploadAndRedirect(args: {
  uploadId: string;
  redirectTo: string;
}) {
  await reviewUpload({ uploadId: args.uploadId, status: "ACCEPTED" });
  redirect(withSaved(args.redirectTo, "accepted"));
}

export async function denyUploadAndRedirect(args: {
  uploadId: string;
  formData: FormData;
  redirectTo: string;
}) {
  const denial_reason = requireString(
    args.formData,
    "denial_reason",
    "Denial reason is required"
  );

  await reviewUpload({
    uploadId: args.uploadId,
    status: "DENIED",
    denial_reason,
  });

  redirect(withSaved(args.redirectTo, "denied"));
}

/** Adds/overwrites saved=... while preserving existing query params */
function withSaved(url: string, value: string) {
  const u = new URL(url, "http://local"); // base required for URL parsing
  u.searchParams.set("saved", value);
  return u.pathname + (u.search ? u.search : "");
}
