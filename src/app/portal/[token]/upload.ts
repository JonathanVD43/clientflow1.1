// src/app/portal/[token]/upload.ts

type UploadCreateOk = {
  ok: true;
  upload: {
    id: string;
    bucket: string;
    storage_key: string;
    document_request_id: string;
    submission_session_id: string;
  };
  signedUrl: string;
};

type UploadCreateErr = { error: string };
type UploadCreateResponse = UploadCreateOk | UploadCreateErr;

function isErr(x: unknown): x is UploadCreateErr {
  return (
    typeof x === "object" &&
    x !== null &&
    "error" in x &&
    typeof (x as { error?: unknown }).error === "string"
  );
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorFromJson(json: unknown, fallback: string) {
  if (isErr(json) && json.error.trim()) return json.error.trim();
  return fallback;
}

export async function uploadFile(
  token: string,
  file: File,
  documentRequestId: string
) {
  // 1) Ask API for a signed upload URL (absolute)
  const createRes = await fetch(`/api/portal-session/${token}/uploads/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      document_request_id: documentRequestId,
      mime_type: file.type || null,
      size_bytes: file.size,
    }),
  });

  const createJson = await safeJson(createRes);

  if (!createRes.ok) {
    throw new Error(
      errorFromJson(
        createJson,
        `Upload init failed (${createRes.status} ${createRes.statusText})`
      )
    );
  }

  const payload = createJson as UploadCreateResponse;

  if (isErr(payload)) throw new Error(payload.error);
  if (!payload.ok) throw new Error("Upload init failed");

  if (typeof payload.signedUrl !== "string" || !payload.signedUrl.trim()) {
    throw new Error("Upload init missing signedUrl");
  }

  const uploadId = payload.upload?.id;
  if (!uploadId) throw new Error("Upload init missing upload.id");

  // 2) PUT bytes to Supabase Storage using the absolute signed URL
  const putRes = await fetch(payload.signedUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
  });

  if (!putRes.ok) {
    const body = await putRes.text().catch(() => "");
    throw new Error(
      `Upload PUT failed (${putRes.status} ${putRes.statusText})${
        body ? `: ${body}` : ""
      }`
    );
  }

  // 3) Mark upload complete (stamps uploaded_at + may finalize session)
  const completeRes = await fetch(
    `/api/portal-session/${token}/uploads/${uploadId}/complete`,
    { method: "POST" }
  );

  const completeJson = await safeJson(completeRes);

  if (!completeRes.ok) {
    throw new Error(
      errorFromJson(
        completeJson,
        `Upload complete failed (${completeRes.status} ${completeRes.statusText})`
      )
    );
  }
}
