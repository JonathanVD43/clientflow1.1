// src/app/portal/[token]/upload.ts

type CreateResponseOk = {
  ok: true;
  upload: {
    id: string;
    storage_key: string;
    submission_session_id: string;
    document_request_id: string;
    bucket?: string;
  };
  signed: {
    path: string;
    token: string;
  };
};

type CreateResponseErr = { error: string };
type CreateResponse = CreateResponseOk | CreateResponseErr;

function isCreateOk(x: CreateResponse): x is CreateResponseOk {
  return typeof x === "object" && x !== null && "ok" in x && (x as { ok?: unknown }).ok === true;
}

export async function uploadFile(token: string, file: File, documentRequestId: string) {
  // 1) Ask API for signed upload URL + upload record
  const res = await fetch(`/api/portal-session/${token}/uploads/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      document_request_id: documentRequestId,
    }),
  });

  const json = (await res.json()) as CreateResponse;

  if (!res.ok || !isCreateOk(json)) {
    const message =
      typeof (json as { error?: unknown }).error === "string"
        ? String((json as { error: string }).error)
        : `Upload init failed (${res.status})`;
    throw new Error(message);
  }

  const uploadId = json.upload.id;
  const bucket = json.upload.bucket ?? "client_uploads";

  // 2) Upload to Supabase Storage signed upload endpoint
  // Supabase signed upload URL shape: /storage/v1/upload/resumable OR upload?token=...
  // In your implementation you're returning { path, token } from createSignedUploadUrl.
  const uploadUrl = `/storage/v1/object/${bucket}/${encodeURIComponent(json.signed.path)}?token=${encodeURIComponent(
    json.signed.token
  )}`;

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
  });

  if (!put.ok) {
    throw new Error(`Storage upload failed (${put.status})`);
  }

  // 3) Notify API that upload is complete (stamps uploaded_at + may finalize session)
  const complete = await fetch(
    `/api/portal-session/${token}/uploads/${uploadId}/complete`,
    { method: "POST" }
  );

  if (!complete.ok) {
    throw new Error(`Upload completion failed (${complete.status})`);
  }
}
