"use server";

import { revalidatePath } from "next/cache";
import { createDocumentRequest } from "@/lib/db/documentRequests";

export async function createDocumentRequestAction(formData: FormData) {
  const clientId = String(formData.get("client_id") || "");
  const title = String(formData.get("title") || "").trim();
  if (!clientId || !title) throw new Error("Missing client/title");

  await createDocumentRequest({ clientId, title });
  revalidatePath(`/clients/${clientId}`);
}
