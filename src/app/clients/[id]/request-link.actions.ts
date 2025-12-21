"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSubmissionSessionForClient } from "@/lib/db/submissionSessions";

function requireStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

// Next.js uses a special error for redirect().
// In Next 15, it contains a digest that starts with "NEXT_REDIRECT".
function isNextRedirect(e: unknown) {
  if (typeof e !== "object" || e === null) return false;
  const digest = (e as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function errorMessage(e: unknown) {
  if (typeof e === "object" && e !== null) {
    const code = (e as { code?: unknown }).code;
    const message = (e as { message?: unknown }).message;

    if (code === "23505") {
      return "Could not create request link due to a database uniqueness rule. (If this keeps happening, we should verify the submission_sessions open-session index and join-table uniqueness constraints.)";
    }

    if (typeof message === "string" && message.trim()) return message;
  }

  return e instanceof Error ? e.message : "Could not create request link";
}

export async function createRequestLinkAction(
  clientId: string,
  formData: FormData
) {
  const selected = requireStringArray(formData, "document_request_id");

  try {
    const created = await createSubmissionSessionForClient({
      clientId,
      documentRequestIds: selected,
    });

    revalidatePath(`/clients/${clientId}`);

    // ✅ this throws a NEXT_REDIRECT "error" internally
    redirect(
      `/clients/${clientId}?requestToken=${encodeURIComponent(
        created.public_token
      )}`
    );
  } catch (e: unknown) {
    // ✅ IMPORTANT: let Next redirects bubble
    if (isNextRedirect(e)) throw e;

    const msg = errorMessage(e);
    redirect(`/clients/${clientId}?requestError=${encodeURIComponent(msg)}`);
  }
}
