// src/app/clients/new/actions.ts
"use server";

import { createClient } from "@/lib/db/clients";
import { extractClientCore } from "@/lib/forms/validators";
import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";

export async function createClientAction(formData: FormData) {
  try {
    const { name, email, phone_number } = extractClientCore(formData);

    const created = await createClient({
      name,
      email,
      phone_number,
    });

    redirectWithSuccess(`/clients/${created.id}`, "created");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create client";
    redirectWithError("/clients/new", msg);
  }
}
