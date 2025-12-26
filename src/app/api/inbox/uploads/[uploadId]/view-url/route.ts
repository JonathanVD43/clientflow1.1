// src/app/api/inbox/uploads/[uploadId]/view-url/route.ts
import { errorResponse, successResponse } from "@/lib/api/responses";
import { assertUuid } from "@/lib/validation/uuid";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUploadForDownload, HttpError } from "@/lib/db/uploads";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await ctx.params;

  try {
    assertUuid("uploadId", uploadId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid uploadId";
    return errorResponse(msg, 400);
  }

  const url = new URL(req.url);
  const downloadParam = url.searchParams.get("download");

  /**
   * Keeping your current semantics:
   * default = download unless ?download=0
   */
  const download = downloadParam === "0" ? false : true;

  try {
    const { storage_key, mime_type, filename } =
      await getUploadForDownload(uploadId);

    const admin = supabaseAdmin();
    const { data, error } = await admin.storage
      .from("client_uploads")
      .createSignedUrl(storage_key, 60, {
        download: download ? filename : false,
      });

    if (error || !data?.signedUrl) {
      const msg = error?.message || "Signing failed";
      return errorResponse(msg, 500);
    }

    return successResponse({
      signedUrl: data.signedUrl,
      mime_type,
      filename,
      download,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create signed url";
    const status = e instanceof HttpError ? e.status : 500;
    return errorResponse(msg, status);
  }
}
