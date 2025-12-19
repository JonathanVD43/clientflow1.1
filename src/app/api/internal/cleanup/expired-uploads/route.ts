// src/app/api/internal/cleanup/expired-uploads/route.ts
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, successResponse } from "@/lib/api/responses";

export async function POST(req: Request) {
  // Optional simple protection: require a shared secret header
  const expected = process.env.CLEANUP_SECRET;
  if (expected) {
    const got = req.headers.get("x-cleanup-secret");
    if (got !== expected) return errorResponse("Unauthorized", 401);
  }

  const supabase = supabaseAdmin();
  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET ?? "client_uploads";

  const nowIso = new Date().toISOString();

  // Keep each run bounded
  const BATCH_SIZE = 200;

  const { data: rows, error } = await supabase
    .from("uploads")
    .select("id,storage_key")
    .is("deleted_at", null)
    .not("storage_key", "is", null)
    .lte("delete_after_at", nowIso)
    .limit(BATCH_SIZE);

  if (error) return errorResponse(error.message, 500);

  const items =
    (rows ?? [])
      .map((r) => ({
        id: String((r as { id?: unknown }).id ?? ""),
        storage_key: String((r as { storage_key?: unknown }).storage_key ?? ""),
      }))
      .filter((r) => r.id && r.storage_key) ?? [];

  if (items.length === 0) {
    return successResponse({ deleted: 0, remaining: 0 });
  }

  // Delete storage objects (best-effort per batch)
  const { error: delErr } = await supabase.storage
    .from(bucket)
    .remove(items.map((x) => x.storage_key));

  if (delErr) return errorResponse(delErr.message, 500);

  // Mark DB rows deleted only after storage deletion succeeds
  const ids = items.map((x) => x.id);

  const { error: updErr } = await supabase
    .from("uploads")
    .update({
      deleted_at: nowIso,
    })
    .in("id", ids);

  if (updErr) return errorResponse(updErr.message, 500);

  return successResponse({
    deleted: items.length,
    remaining: Math.max(0, BATCH_SIZE - items.length),
  });
}
