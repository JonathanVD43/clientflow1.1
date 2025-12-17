"use client";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function uploadFile(
  token: string,
  file: File,
  documentRequestId?: string
) {
  // 1) ask server for signed upload
  const res = await fetch(`/api/portal/${token}/uploads/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      document_request_id: documentRequestId ?? null,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Failed to create upload");

  const { upload, signed } = json;

  // 2) upload direct to storage
  const { error } = await supabase.storage
    .from(upload.bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type || undefined,
    });

  if (error) throw error;

  return upload.id;
}
