"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/db/clients";
import { extractClientCore } from "@/lib/forms/validators";

export async function createClientAction(formData: FormData) {
  const { name, email, phone_number } = extractClientCore(formData);

  const created = await createClient({
    name,
    email,
    phone_number,
  });

  redirect(`/clients/${created.id}?saved=created`);
}
