"use server";

import { redirect } from "next/navigation";
import { createClientAsDevOwner } from "@/lib/db/clients";

export async function createClientAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone_number") ?? "").trim();

  if (!name) throw new Error("Name is required");

  const created = await createClientAsDevOwner({
    name,
    email: emailRaw ? emailRaw : null,
    phone_number: phoneRaw ? phoneRaw : null,
  });

  if (!created?.id) throw new Error("createClientAsDevOwner returned no id");

  redirect(`/clients/${created.id}`);
}
