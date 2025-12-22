import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { assertUuid } from "@/lib/validation/uuid";
import { createSignedDownloadUrl } from "@/lib/db/uploads";

function safeInlineFilename(name: string) {
  return name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 150) || "file";
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

  try {
    assertUuid("uploadId", uploadId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid uploadId";
    return NextResponse.json({ error: msg }, { status: 400 });
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

  // Get a short-lived signed URL (and apply 72h retention rule via helper)
  let signedUrl: string;
  let mime_type: string | null;
  let filename: string;

  try {
    const res = await createSignedDownloadUrl({
      uploadId,
      expiresInSeconds: 60,
      download: false,
    });

    signedUrl = res.signedUrl;
    mime_type = res.mime_type;
    filename = res.filename;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create signed url";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!isPreviewable(mime_type)) {
    return NextResponse.json(
      { error: "Preview not available for this file type" },
      { status: 415 }
    );
  }

  // Fetch the file server-side and stream it back (same-origin)
  const fileRes = await fetch(signedUrl);
  if (!fileRes.ok || !fileRes.body) {
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
      "Content-Disposition": `inline; filename="${safeInlineFilename(filename)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
