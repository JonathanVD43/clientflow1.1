import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CreateUploadBody = {
  filename?: string;
  mime_type?: string | null;
  size_bytes?: number;
  document_request_id?: string | null;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params; // ✅ unwrap params promise
  const cleanToken = (token ?? "").trim();

  if (!cleanToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as CreateUploadBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filename = String(body.filename ?? "").trim();
  const mime_type = body.mime_type ? String(body.mime_type).trim() : null;
  const size_bytes = Number(body.size_bytes);
  const document_request_id = body.document_request_id
    ? String(body.document_request_id).trim()
    : null;

  if (!filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  if (!Number.isFinite(size_bytes) || size_bytes < 0) {
    return NextResponse.json(
      { error: "size_bytes must be a non-negative number" },
      { status: 400 }
    );
  }

  // Basic filename safety (prevents path injection / weird keys)
  const safeFilename = filename.replace(/[\/\\]/g, "_").slice(0, 200);

  const supabase = supabaseAdmin();

  // 1) Find client by public_token
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id,active,portal_enabled,user_id")
    .eq("public_token", cleanToken)
    .maybeSingle();

  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  if (!client.active || !client.portal_enabled) {
    return NextResponse.json({ error: "Portal disabled" }, { status: 403 });
  }

  // 2) Find or create OPEN submission session for this client
  const { data: existingSession, error: sessErr } = await supabase
    .from("submission_sessions")
    .select("id")
    .eq("user_id", client.user_id)
    .eq("client_id", client.id)
    .eq("status", "OPEN")
    .maybeSingle();

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  let sessionId = existingSession?.id;

  if (!sessionId) {
    const { data: newSession, error: newSessErr } = await supabase
      .from("submission_sessions")
      .insert({
        user_id: client.user_id,
        client_id: client.id,
        status: "OPEN",
      })
      .select("id")
      .single();

    if (newSessErr) {
      // Possible race condition: two uploads creating session simultaneously.
      // Retry once.
      const { data: retry, error: retryErr } = await supabase
        .from("submission_sessions")
        .select("id")
        .eq("user_id", client.user_id)
        .eq("client_id", client.id)
        .eq("status", "OPEN")
        .maybeSingle();

      if (retryErr || !retry?.id) {
        return NextResponse.json({ error: newSessErr.message }, { status: 500 });
      }

      sessionId = retry.id;
    } else {
      sessionId = newSession.id;
    }
  }

  // 3) Create uploads row (storage_key updated after we pick path)
  const { data: upload, error: uploadErr } = await supabase
    .from("uploads")
    .insert({
      user_id: client.user_id,
      client_id: client.id,
      submission_session_id: sessionId,
      document_request_id,
      original_filename: safeFilename,
      mime_type,
      size_bytes,
      status: "PENDING",
      // storage_key filled after we generate path
      storage_key: "pending", // temporary non-empty value to satisfy NOT NULL
    })
    .select("id,client_id")
    .single();

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // 4) Signed upload URL
  // Decide bucket name (create this in Supabase Storage)
  const bucket = "client-uploads";
  const path = `clients/${upload.client_id}/${upload.id}/${safeFilename}`;

  const { data: signed, error: signedErr } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (signedErr) {
    return NextResponse.json({ error: signedErr.message }, { status: 500 });
  }

  // 5) Persist storage_key now that we know it
  const { error: updateErr } = await supabase
    .from("uploads")
    .update({ storage_key: path })
    .eq("id", upload.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    upload: {
      id: upload.id,
      bucket,
      storage_key: path,
    },
    signed, // { path, token } etc.
  });
}
