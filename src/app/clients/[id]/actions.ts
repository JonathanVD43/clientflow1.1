"use server";

import { redirect } from "next/navigation";
import { updateClient, deleteClient } from "@/lib/db/clients";

export async function updateClientAction(clientId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone_number") ?? "").trim();

  const active = formData.get("active") === "on";
  const portal_enabled = formData.get("portal_enabled") === "on";
  const notify_by_email = formData.get("notify_by_email") === "on";

  if (!name) throw new Error("Name is required");

  await updateClient(clientId, {
    name,
    email: emailRaw ? emailRaw : null,
    phone_number: phoneRaw ? phoneRaw : null,
    active,
    portal_enabled,
    notify_by_email,
  });

  redirect(`/clients/${clientId}`);
}

export async function deleteClientAction(clientId: string) {
  await deleteClient(clientId);
  redirect("/clients");
}
