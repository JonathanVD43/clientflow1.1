import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, successResponse } from "@/lib/api/responses";
import { assertUuid } from "@/lib/validation/uuid";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await ctx.params;

  try {
    assertUuid("uploadId", uploadId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid uploadId";
    return errorResponse(msg, 400);
  }

  // 1) Require signed-in user (RLS will enforce ownership on uploads table)
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) return errorResponse("Not authenticated", 401);

  // 2) Fetch upload row via RLS (only the owner should see it)
  const { data: upload, error: upErr } = await supabase
    .from("uploads")
    .select("id, storage_key, mime_type, status, deleted_at")
    .eq("id", uploadId)
    .single();

  if (upErr || !upload) return errorResponse("Upload not found", 404);
  if (upload.deleted_at) return errorResponse("Upload deleted", 410);

  if (!upload.storage_key || typeof upload.storage_key !== "string") {
    return errorResponse("Upload not ready (missing storage key)", 409);
  }

  // ✅ IMPORTANT: must match portal upload route
  const bucket = (process.env.NEXT_PUBLIC_UPLOADS_BUCKET || "client_uploads").trim();

  // 3) Generate signed URL using service role (secret server-side)
  const admin = supabaseAdmin();

  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(upload.storage_key, 60, {
      download: false,
    });

  if (error || !data?.signedUrl) {
    return errorResponse(error?.message ?? "Could not create signed url", 500);
  }

  return successResponse({
    signedUrl: data.signedUrl,
    mime_type: upload.mime_type ?? null,
  });
}
