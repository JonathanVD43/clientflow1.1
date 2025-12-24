// src/app/clients/[id]/templates.actions.ts
"use server";

import { redirectWithError, redirectWithSuccess } from "@/lib/navigation/redirects";
import { assertUuid } from "@/lib/validation/uuid";
import {
  createRequestTemplate,
  saveRequestTemplate,
  deleteRequestTemplate,
  createSessionFromTemplateNow,
} from "@/lib/db/requestTemplates";
import { enqueueEmail } from "@/lib/db/emailOutbox";
import { requireUser } from "@/lib/auth/require-user";

function checkbox(formData: FormData, key: string) {
  const v = formData.get(key);
  if (v === null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

function requireString(formData: FormData, key: string, message: string) {
  const v = formData.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new Error(message);
  return s;
}

function stringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

function optionalInt(formData: FormData, key: string): number | null {
  const v = formData.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!/^\d+$/.test(s)) throw new Error("Due day must be a number");
  const n = Number(s);
  if (n < 1 || n > 31) throw new Error("Due day must be 1..31");
  return n;
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Request failed";
}

type ClientNameEmailRow = { name: string | null; email: string | null };

export async function createRequestTemplateAction(clientId: string, formData: FormData) {
  try {
    assertUuid("clientId", clientId);

    const name = requireString(formData, "template_name", "Template name is required");
    const documentRequestIds = stringArray(formData, "template_document_request_id");

    const startNextMonth = checkbox(formData, "start_next_month");
    const silentAutoSend = checkbox(formData, "silent_auto_send");
    const sendFirstNow = checkbox(formData, "send_first_now");
    const sendEmailNow = checkbox(formData, "send_email_now");
    const dueDayOfMonth = optionalInt(formData, "due_day_of_month");

    const created = await createRequestTemplate({
      clientId,
      name,
      documentRequestIds,
      startNextMonth,
      silentAutoSend,
      dueDayOfMonth,
    });

    if (sendFirstNow) {
      const session = await createSessionFromTemplateNow({
        clientId,
        templateId: created.id,
        dueDayOfMonth,
      });

      if (sendEmailNow) {
        const { supabase, user } = await requireUser();

        const { data: clientRow, error: cErr } = await supabase
          .from("clients")
          .select("name,email")
          .eq("id", clientId)
          .eq("user_id", user.id)
          .single<ClientNameEmailRow>();

        if (cErr) throw new Error(cErr.message);

        const email = (clientRow.email ?? "").trim();
        const clientName = (clientRow.name ?? "(client)").trim();
        if (!email) throw new Error("Client has no email address");

        const baseUrl = process.env.APP_BASE_URL;
        if (!baseUrl) throw new Error("Missing APP_BASE_URL");

        const link = `${baseUrl.replace(/\/+$/, "")}/portal/${encodeURIComponent(
          session.publicToken
        )}`;

        await enqueueEmail({
          toEmail: email,
          template: "manual_request_link",
          payload: { clientName, link, templateName: name, sentVia: "manual" },
          idempotencyKey: `manual_request_link:${session.sessionId}`,
          clientId,
          submissionSessionId: session.sessionId,
        });
      }
    }

    redirectWithSuccess(`/clients/${clientId}`, "template_created");
  } catch (e) {
    redirectWithError(`/clients/${clientId}`, errorMessage(e));
  }
}

/**
 * ✅ Single “Save template” action:
 * - settings (name/enabled/silent/startNextMonth/dueDay)
 * - and the selected docs list
 */
export async function saveTemplateAction(clientId: string, templateId: string, formData: FormData) {
  try {
    assertUuid("clientId", clientId);
    assertUuid("templateId", templateId);

    const name = requireString(formData, "template_name", "Template name is required");
    const enabled = checkbox(formData, "enabled");
    const silentAutoSend = checkbox(formData, "silent_auto_send");
    const startNextMonth = checkbox(formData, "start_next_month");
    const dueDayOfMonth = optionalInt(formData, "due_day_of_month");

    const documentRequestIds = stringArray(formData, "template_document_request_id");
    if (documentRequestIds.length === 0) {
      throw new Error("Select at least one document for this template");
    }

    await saveRequestTemplate({
      clientId,
      templateId,
      name,
      enabled,
      silentAutoSend,
      startNextMonth,
      dueDayOfMonth,
      documentRequestIds,
    });

    redirectWithSuccess(`/clients/${clientId}`, "template_updated");
  } catch (e) {
    redirectWithError(`/clients/${clientId}`, errorMessage(e));
  }
}

export async function deleteTemplateAction(clientId: string, templateId: string) {
  try {
    assertUuid("clientId", clientId);
    assertUuid("templateId", templateId);

    await deleteRequestTemplate({ clientId, templateId });
    redirectWithSuccess(`/clients/${clientId}`, "template_deleted");
  } catch (e) {
    redirectWithError(`/clients/${clientId}`, errorMessage(e));
  }
}

export async function sendTemplateNowAction(clientId: string, templateId: string, formData: FormData) {
  try {
    assertUuid("clientId", clientId);
    assertUuid("templateId", templateId);

    const sendEmailNow = checkbox(formData, "send_email_now");
    const dueDayOfMonth = optionalInt(formData, "due_day_of_month");

    const session = await createSessionFromTemplateNow({
      clientId,
      templateId,
      dueDayOfMonth,
    });

    if (sendEmailNow) {
      const { supabase, user } = await requireUser();

      const { data: clientRow, error: cErr } = await supabase
        .from("clients")
        .select("name,email")
        .eq("id", clientId)
        .eq("user_id", user.id)
        .single<ClientNameEmailRow>();

      if (cErr) throw new Error(cErr.message);

      const email = (clientRow.email ?? "").trim();
      const clientName = (clientRow.name ?? "(client)").trim();
      if (!email) throw new Error("Client has no email address");

      const baseUrl = process.env.APP_BASE_URL;
      if (!baseUrl) throw new Error("Missing APP_BASE_URL");

      const link = `${baseUrl.replace(/\/+$/, "")}/portal/${encodeURIComponent(
        session.publicToken
      )}`;

      await enqueueEmail({
        toEmail: email,
        template: "manual_request_link",
        payload: { clientName, link, templateName: "(template)", sentVia: "manual" },
        idempotencyKey: `manual_request_link:${session.sessionId}`,
        clientId,
        submissionSessionId: session.sessionId,
      });
    }

    redirectWithSuccess(`/clients/${clientId}`, "template_sent");
  } catch (e) {
    redirectWithError(`/clients/${clientId}`, errorMessage(e));
  }
}
