// src/app/api/inbox/uploads/[uploadId]/preview/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertUuid } from "@/lib/validation/uuid";
import { getUploadForDownload, HttpError } from "@/lib/db/uploads";

/**
 * Sanitize filenames for inline Content-Disposition
 */
function safeInlineFilename(name: string) {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 150) || "file";
}

/**
 * Only allow types that browsers can safely preview inline
 */
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

  try {
    assertUuid("uploadId", uploadId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid uploadId";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Require signed-in user (preview is not public)
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let signedUrl: string;
  let mime_type: string | null;
  let filename: string;

  try {
    // 1) DB-layer logic: ownership + retention + viewed marking
    const meta = await getUploadForDownload(uploadId);
    mime_type = meta.mime_type;
    filename = meta.filename;

    if (!isPreviewable(mime_type)) {
      return NextResponse.json(
        { error: "Preview not available for this file type" },
        { status: 415 }
      );
    }

    // 2) Storage signing (service role)
    const admin = supabaseAdmin();
    const { data, error } = await admin.storage
      .from("client_uploads")
      .createSignedUrl(meta.storage_key, 60, { download: false });

    if (error || !data?.signedUrl) {
      const msg = error?.message || "Could not sign preview URL";
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    signedUrl = data.signedUrl;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create signed url";
    const status = e instanceof HttpError ? e.status : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  // Fetch from storage and stream back same-origin
  const fileRes = await fetch(signedUrl);

  if (!fileRes.ok || !fileRes.body) {
    if (fileRes.status === 404) {
      return NextResponse.json(
        { error: "File not found in storage" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Could not fetch file from storage" },
      { status: 502 }
    );
  }

  const contentType =
    fileRes.headers.get("content-type") ||
    mime_type ||
    "application/octet-stream";

  return new Response(fileRes.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${safeInlineFilename(
        filename
      )}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
