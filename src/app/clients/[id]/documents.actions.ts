"use server";

import { redirect } from "next/navigation";
import {
  createDocumentRequest,
  updateDocumentRequest,
  deleteDocumentRequest,
} from "@/lib/db/documentRequests";

export async function addDocumentRequestAction(
  clientId: string,
  formData: FormData
) {
  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();

  if (!title) throw new Error("Document name is required");

  await createDocumentRequest({
    clientId,
    title,
    description: descriptionRaw ? descriptionRaw : null,
  });

  // ✅ triggers "Document successfully added"
  redirect(`/clients/${clientId}?saved=doc-added`);
}

export async function updateDocumentRequestAction(
  clientId: string,
  docId: string,
  formData: FormData
) {
  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const required = formData.get("required") === "on";
  const active = formData.get("active") === "on";

  if (!title) throw new Error("Document name is required");

  await updateDocumentRequest({
    id: docId,
    title,
    description: descriptionRaw ? descriptionRaw : null,
    required,
    active,
  });

  // ✅ triggers "Document successfully updated"
  redirect(`/clients/${clientId}?saved=doc-updated`);
}

export async function deleteDocumentRequestAction(
  clientId: string,
  docId: string
) {
  await deleteDocumentRequest(docId);

  // ✅ triggers "Document successfully deleted"
  redirect(`/clients/${clientId}?saved=doc-deleted`);
}
