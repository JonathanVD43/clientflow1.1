// src/app/inbox/[sessionId]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";
import { assertUuid } from "@/lib/validation/uuid";
import { getSessionReviewSummary } from "@/lib/db/uploads";
import { createSubmissionSessionForClient } from "@/lib/db/submissionSessions";

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Request failed";
}

export async function requestReplacementsAction(sessionId: string) {
  try {
    assertUuid("sessionId", sessionId);

    const summary = await getSessionReviewSummary(sessionId);

    // Only request replacements for DENIED items that have a document_request_id
    const documentRequestIds: string[] = summary.denied
      .map((u) => u.document_request_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (documentRequestIds.length === 0) {
      redirectWithError(`/inbox/${sessionId}`, "No denied files to request replacements for.");
    }

    const created = await createSubmissionSessionForClient({
      clientId: summary.client.id,
      documentRequestIds,
    });

    revalidatePath(`/inbox/${sessionId}`);
    revalidatePath(`/inbox`);

    // send reviewer to client page with token so they can copy it / see it
    redirectWithSuccess(
      `/clients/${summary.client.id}?requestToken=${encodeURIComponent(created.public_token)}`,
      "replacement_link_created"
    );
  } catch (e: unknown) {
    redirectWithError(`/inbox/${sessionId}`, errorMessage(e));
  }
}
