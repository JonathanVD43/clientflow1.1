import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeInlineFilename(name: string | null | undefined) {
  const base = String(name ?? "file").trim() || "file";
  // keep it boring and header-safe
  return base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 150);
}

function isPreviewable(mime: string | null) {
  if (!mime) return false;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("text/")) return true;
  return false;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ uploadId: string }> }
) {
  const { uploadId } = await ctx.params;

  if (!UUID_RE.test(uploadId)) {
    return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
  }

  // Require signed-in user
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch upload row via RLS (owner-only)
  const { data: upload, error: upErr } = await supabase
    .from("uploads")
    .select("id, storage_key, mime_type, original_filename, deleted_at")
    .eq("id", uploadId)
    .single();

  if (upErr || !upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.deleted_at) {
    return NextResponse.json({ error: "Upload deleted" }, { status: 410 });
  }

  const mime = (upload.mime_type ?? null) as string | null;
  if (!isPreviewable(mime)) {
    return NextResponse.json(
      { error: "Preview not available for this file type" },
      { status: 415 }
    );
  }

  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET ?? "client_uploads";

  // Create short-lived signed URL with service role
  const admin = supabaseAdmin();
  const { data: signed, error: signErr } = await admin.storage
    .from(bucket)
    .createSignedUrl(upload.storage_key, 60); // 60 seconds

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message ?? "Could not create signed url" },
      { status: 500 }
    );
  }

  // Fetch the file server-side and stream it back (same-origin)
  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok || !fileRes.body) {
    return NextResponse.json(
      { error: "Could not fetch file from storage" },
      { status: 502 }
    );
  }

  const filename = safeInlineFilename(upload.original_filename);
  const contentType =
    fileRes.headers.get("content-type") || mime || "application/octet-stream";

  return new Response(fileRes.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
