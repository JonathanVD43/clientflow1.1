// src/app/clients/[id]/documents.actions.ts
"use server";

import {
  createDocumentRequest,
  updateDocumentRequest,
  deleteDocumentRequest,
} from "@/lib/db/documentRequests";
import {
  extractDocumentRequestCreate,
  extractDocumentRequestUpdate,
} from "@/lib/forms/validators";
import { redirectWithSuccess } from "@/lib/navigation/redirects";

function qs(formData: FormData, keys: string[]) {
  const sp = new URLSearchParams();
  for (const k of keys) {
    const v = formData.get(k);
    if (typeof v === "string" && v.trim()) sp.set(k, v.trim());
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function addDocumentRequestAction(clientId: string, formData: FormData) {
  const { title, description } = extractDocumentRequestCreate(formData);

  await createDocumentRequest({
    clientId,
    title,
    description,
  });

  redirectWithSuccess(`/clients/${clientId}${qs(formData, ["lib", "edit"])}`, "doc_added");
}

export async function updateDocumentRequestAction(
  clientId: string,
  docId: string,
  formData: FormData
) {
  const { title, description, required, active, recurring } =
    extractDocumentRequestUpdate(formData);

  await updateDocumentRequest({
    id: docId,
    title,
    description,
    required,
    active,
    recurring,
  });

  // keep selection
  redirectWithSuccess(
    `/clients/${clientId}${qs(formData, ["lib", "edit", "docId"])}`,
    "doc_updated"
  );
}

export async function deleteDocumentRequestAction(
  clientId: string,
  docId: string,
  formData?: FormData
) {
  await deleteDocumentRequest(docId);

  const suffix =
    formData ? qs(formData, ["lib", "edit"]) : "";

  redirectWithSuccess(`/clients/${clientId}${suffix}`, "doc_deleted");
}
