// src/app/clients/[id]/actions.ts
"use server";

import { updateClient, deleteClient } from "@/lib/db/clients";
import { extractClientUpdate, extractDueSettings } from "@/lib/forms/validators";
import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";

export async function updateClientAction(clientId: string, formData: FormData) {
  try {
    const patch = extractClientUpdate(formData);

    await updateClient(clientId, {
      name: patch.name,
      email: patch.email,
      phone_number: patch.phone_number,
      active: patch.active,
      portal_enabled: patch.portal_enabled,
      notify_by_email: patch.notify_by_email,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save client";
    redirectWithError(`/clients/${clientId}`, msg);
  }

  redirectWithSuccess(`/clients/${clientId}`, "client");
}

export async function updateClientDueSettingsAction(
  clientId: string,
  formData: FormData
) {
  try {
    const { due_day_of_month } = extractDueSettings(formData);
    await updateClient(clientId, { due_day_of_month });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save due settings";
    redirectWithError(`/clients/${clientId}`, msg);
  }

  redirectWithSuccess(`/clients/${clientId}`, "due");
}

export async function deleteClientAction(clientId: string) {
  try {
    await deleteClient(clientId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not delete client";
    redirectWithError(`/clients/${clientId}`, msg);
  }

  redirectWithSuccess("/clients", "deleted");
}
