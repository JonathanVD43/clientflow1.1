// src/app/clients/new/actions.ts
"use server";

import { createClient } from "@/lib/db/clients";
import { extractClientCore } from "@/lib/forms/validators";
import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";

type RedirectErrorLike = {
  digest?: unknown;
};

function isNextRedirectError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as RedirectErrorLike).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export async function createClientAction(formData: FormData) {
  try {
    const { name, email, phone_number } = extractClientCore(formData);

    const created = await createClient({
      name,
      email,
      phone_number,
    });

    // NOTE: redirectWithSuccess throws NEXT_REDIRECT; we must NOT catch it as an error.
    redirectWithSuccess(`/clients/${created.id}`, "created");
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;

    const msg = e instanceof Error ? e.message : "Could not create client";
    redirectWithError("/clients/new", msg);
  }
}
