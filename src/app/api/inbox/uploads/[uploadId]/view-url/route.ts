import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await ctx.params;

  if (!UUID_RE.test(uploadId)) {
    return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
  }

  // 1) Require signed-in user (RLS will enforce ownership on uploads table)
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2) Fetch upload row via RLS (only the owner should see it)
  const { data: upload, error: upErr } = await supabase
    .from("uploads")
    .select("id, storage_key, mime_type, status, deleted_at")
    .eq("id", uploadId)
    .single();

  if (upErr || !upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.deleted_at) {
    return NextResponse.json({ error: "Upload deleted" }, { status: 410 });
  }

  if (!upload.storage_key || typeof upload.storage_key !== "string") {
    return NextResponse.json(
      { error: "Upload not ready (missing storage key)" },
      { status: 409 }
    );
  }

  // ✅ IMPORTANT: this MUST match the bucket used by the portal upload route
  // Ideally set NEXT_PUBLIC_UPLOADS_BUCKET in .env.local and use it everywhere.
  const bucket = (process.env.NEXT_PUBLIC_UPLOADS_BUCKET || "client_uploads").trim();

  // 3) Generate signed URL using service role (secret server-side)
  const admin = supabaseAdmin();

  // Keep it short-lived (e.g., 60 seconds)
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(upload.storage_key, 60, {
      // Encourage inline viewing in browsers
      download: false,
    });

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create signed url" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    mime_type: upload.mime_type ?? null,
  });
}
