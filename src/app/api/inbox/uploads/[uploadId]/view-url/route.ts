// src/app/api/inbox/uploads/[uploadId]/view-url/route.ts
import { errorResponse, successResponse } from "@/lib/api/responses";
import { assertUuid } from "@/lib/validation/uuid";
import { createSignedDownloadUrl } from "@/lib/db/uploads";

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

  // Optional: allow caller to choose inline vs download
  // /api/inbox/uploads/:id/view-url?download=0  -> inline-friendly signed URL
  // default is download=1
  const url = new URL(req.url);
  const downloadParam = url.searchParams.get("download");
  const download = downloadParam === "0" ? false : true;

  try {
    const { signedUrl, mime_type, filename } = await createSignedDownloadUrl({
      uploadId,
      expiresInSeconds: 60,
      download,
    });

    return successResponse({ signedUrl, mime_type, filename, download });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create signed url";
    return errorResponse(msg, 500);
  }
}
