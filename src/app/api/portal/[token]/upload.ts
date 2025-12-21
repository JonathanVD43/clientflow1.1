// src/app/portal/[token]/upload.ts

type CreateOk = {
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

type CreateErr = { error: string };
type CreateResp = CreateOk | CreateErr;

function isCreateOk(x: unknown): x is CreateOk {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Partial<CreateOk>;
  return (
    o.ok === true &&
    typeof o.signedUrl === "string" &&
    typeof o.upload?.id === "string"
  );
}

export async function uploadFile(token: string, file: File, documentRequestId: string) {
  // 1) Create upload row + signed URL
  const initRes = await fetch(`/api/portal-session/${token}/uploads/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      document_request_id: documentRequestId,
    }),
  });

  const initJson = (await initRes.json()) as unknown;

  if (!initRes.ok || !isCreateOk(initJson)) {
    const err =
      typeof (initJson as { error?: unknown })?.error === "string"
        ? String((initJson as { error: string }).error)
        : `Failed to start upload (${initRes.status})`;
    throw new Error(err);
  }

  const uploadId = initJson.upload.id;
  const signedUrl = initJson.signedUrl;

  // 2) Upload bytes to Supabase Storage (absolute URL, not localhost)
  const putRes = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`Storage upload failed (${putRes.status})`);
  }

  // 3) Complete
  const completeRes = await fetch(
    `/api/portal-session/${token}/uploads/${uploadId}/complete`,
    { method: "POST" }
  );

  if (!completeRes.ok) {
    throw new Error(`Upload completion failed (${completeRes.status})`);
  }
}
