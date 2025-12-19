"use server";

import { redirect } from "next/navigation";
import {
  createDocumentRequest,
  updateDocumentRequest,
  deleteDocumentRequest,
} from "@/lib/db/documentRequests";
import {
  extractDocumentRequestCreate,
  extractDocumentRequestUpdate,
} from "@/lib/forms/validators";

export async function addDocumentRequestAction(
  clientId: string,
  formData: FormData
) {
  const { title, description } = extractDocumentRequestCreate(formData);

  await createDocumentRequest({
    clientId,
    title,
    description,
  });

  redirect(`/clients/${clientId}?saved=doc_added`);
}

export async function updateDocumentRequestAction(
  clientId: string,
  docId: string,
  formData: FormData
) {
  const { title, description, required, active } =
    extractDocumentRequestUpdate(formData);

  await updateDocumentRequest({
    id: docId,
    title,
    description,
    required,
    active,
  });

  redirect(`/clients/${clientId}?saved=doc_updated`);
}

export async function deleteDocumentRequestAction(clientId: string, docId: string) {
  await deleteDocumentRequest(docId);
  redirect(`/clients/${clientId}?saved=doc_deleted`);
}
