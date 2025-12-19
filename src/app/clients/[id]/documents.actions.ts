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

  redirectWithSuccess(`/clients/${clientId}`, "doc_added");
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

  redirectWithSuccess(`/clients/${clientId}`, "doc_updated");
}

export async function deleteDocumentRequestAction(
  clientId: string,
  docId: string
) {
  await deleteDocumentRequest(docId);
  redirectWithSuccess(`/clients/${clientId}`, "doc_deleted");
}
