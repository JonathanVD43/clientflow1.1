"use server";

import { createClient } from "@/lib/db/clients";
import { extractClientCore } from "@/lib/forms/validators";
import { redirectWithSuccess } from "@/lib/navigation/redirects";

export async function createClientAction(formData: FormData) {
  const { name, email, phone_number } = extractClientCore(formData);

  const created = await createClient({
    name,
    email,
    phone_number,
  });

  redirectWithSuccess(`/clients/${created.id}`, "created");
}
