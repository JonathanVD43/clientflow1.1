// src/lib/db/requestTemplates.ts
import { requireUser } from "@/lib/auth/require-user";
import { assertUuid } from "@/lib/validation/uuid";
import { createSubmissionSessionForClient } from "@/lib/db/submissionSessions";

export type RequestTemplateRow = {
  id: string;
  user_id: string;
  client_id: string;
  name: string;
  enabled: boolean;
  frequency: "monthly";
  silent_auto_send: boolean;
  start_next_month: boolean;
  due_day_of_month: number | null;
  created_at: string;
  updated_at: string;
};

export type TemplateDocumentRow = {
  request_template_id: string;
  document_request_id: string;
  title: string | null;
  active: boolean;
};

type IdRow = { id: string };
type JoinRow = { request_template_id: string; document_request_id: string };
type DocLiteRow = { id: string; title: string | null; active: boolean };

function uniqStrings(xs: string[]) {
  return Array.from(new Set(xs.map((s) => s.trim()).filter(Boolean)));
}

export async function listRequestTemplatesForClient(
  clientId: string
): Promise<RequestTemplateRow[]> {
  assertUuid("clientId", clientId);
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("request_templates")
    .select(
      "id,user_id,client_id,name,enabled,frequency,silent_auto_send,start_next_month,due_day_of_month,created_at,updated_at"
    )
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<RequestTemplateRow[]>();

  if (error) throw error;
  return data ?? [];
}

/**
 * Return only docs that are attached to this template.
 * Implementation avoids the nested-join typing mismatch by doing two queries.
 */
export async function listTemplateDocuments(
  templateId: string
): Promise<TemplateDocumentRow[]> {
  assertUuid("templateId", templateId);
  const { supabase, user } = await requireUser();

  // 1) Join rows
  const { data: joinRows, error: jErr } = await supabase
    .from("request_template_document_requests")
    .select("request_template_id,document_request_id")
    .eq("request_template_id", templateId)
    .eq("user_id", user.id)
    .returns<JoinRow[]>();

  if (jErr) throw jErr;

  const ids = (joinRows ?? []).map((r) => r.document_request_id);
  if (ids.length === 0) return [];

  // 2) Load doc metadata
  const { data: docs, error: dErr } = await supabase
    .from("document_requests")
    .select("id,title,active")
    .eq("user_id", user.id)
    .in("id", ids)
    .returns<DocLiteRow[]>();

  if (dErr) throw dErr;

  const byId = new Map((docs ?? []).map((d) => [d.id, d] as const));

  // Preserve join order
  return (joinRows ?? []).map((jr) => {
    const d = byId.get(jr.document_request_id);
    return {
      request_template_id: jr.request_template_id,
      document_request_id: jr.document_request_id,
      title: d?.title ?? null,
      active: d?.active ?? false,
    };
  });
}

export async function createRequestTemplate(input: {
  clientId: string;
  name: string;
  documentRequestIds: string[];
  startNextMonth: boolean;
  silentAutoSend: boolean;
  dueDayOfMonth: number | null;
}): Promise<{ id: string }> {
  assertUuid("clientId", input.clientId);

  const docIds = uniqStrings(input.documentRequestIds);
  if (docIds.length === 0) throw new Error("Select at least one document");
  for (const id of docIds) assertUuid("documentRequestId", id);

  const name = input.name.trim();
  if (!name) throw new Error("Template name is required");

  const due =
    input.dueDayOfMonth === null
      ? null
      : Number.isFinite(input.dueDayOfMonth)
      ? input.dueDayOfMonth
      : null;

  if (due !== null && (due < 1 || due > 31)) {
    throw new Error("Due day must be 1..31");
  }

  const { supabase, user } = await requireUser();

  // Ensure client belongs to user
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select("id")
    .eq("id", input.clientId)
    .eq("user_id", user.id)
    .single<IdRow>();

  if (cErr) throw cErr;
  if (!client) throw new Error("Client not found");

  // Ensure docs belong to client/user and are active
  const { data: docs, error: dErr } = await supabase
    .from("document_requests")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("id", docIds)
    .returns<IdRow[]>();

  if (dErr) throw dErr;

  const found = new Set((docs ?? []).map((d) => d.id));
  const missing = docIds.filter((id) => !found.has(id));
  if (missing.length) throw new Error("One or more selected documents are invalid or inactive");

  // Create template
  const { data: tpl, error: tErr } = await supabase
    .from("request_templates")
    .insert({
      user_id: user.id,
      client_id: input.clientId,
      name,
      enabled: true,
      frequency: "monthly",
      silent_auto_send: input.silentAutoSend,
      start_next_month: input.startNextMonth,
      due_day_of_month: due,
    })
    .select("id")
    .single<IdRow>();

  if (tErr) throw tErr;
  if (!tpl?.id) throw new Error("Template created but id missing");

  // Attach docs
  const joinRows = docIds.map((document_request_id) => ({
    user_id: user.id,
    client_id: input.clientId,
    request_template_id: tpl.id,
    document_request_id,
  }));

  const { error: jErr } = await supabase
    .from("request_template_document_requests")
    .insert(joinRows);

  if (jErr) throw jErr;

  return { id: tpl.id };
}

export async function setRequestTemplateEnabled(
  templateId: string,
  enabled: boolean
): Promise<void> {
  assertUuid("templateId", templateId);
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("request_templates")
    .update({ enabled })
    .eq("id", templateId)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function replaceTemplateDocuments(input: {
  templateId: string;
  clientId: string;
  documentRequestIds: string[];
}): Promise<void> {
  assertUuid("templateId", input.templateId);
  assertUuid("clientId", input.clientId);

  const docIds = uniqStrings(input.documentRequestIds);
  if (docIds.length === 0) throw new Error("Select at least one document");
  for (const id of docIds) assertUuid("documentRequestId", id);

  const { supabase, user } = await requireUser();

  // Verify template ownership
  const { data: tpl, error: tErr } = await supabase
    .from("request_templates")
    .select("id,client_id")
    .eq("id", input.templateId)
    .eq("user_id", user.id)
    .single<{ id: string; client_id: string }>();

  if (tErr) throw tErr;
  if (!tpl) throw new Error("Template not found");
  if (tpl.client_id !== input.clientId) throw new Error("Template does not belong to this client");

  // Verify docs belong to client/user
  const { data: docs, error: dErr } = await supabase
    .from("document_requests")
    .select("id")
    .eq("client_id", input.clientId)
    .eq("user_id", user.id)
    .eq("active", true)
    .in("id", docIds)
    .returns<IdRow[]>();

  if (dErr) throw dErr;

  const found = new Set((docs ?? []).map((d) => d.id));
  const missing = docIds.filter((id) => !found.has(id));
  if (missing.length) throw new Error("One or more selected documents are invalid or inactive");

  // Replace join rows (delete then insert)
  const { error: delErr } = await supabase
    .from("request_template_document_requests")
    .delete()
    .eq("request_template_id", input.templateId)
    .eq("user_id", user.id);

  if (delErr) throw delErr;

  const joinRows = docIds.map((document_request_id) => ({
    user_id: user.id,
    client_id: input.clientId,
    request_template_id: input.templateId,
    document_request_id,
  }));

  const { error: insErr } = await supabase
    .from("request_template_document_requests")
    .insert(joinRows);

  if (insErr) throw insErr;
}

export async function saveRequestTemplate(input: {
  clientId: string;
  templateId: string;
  name: string;
  enabled: boolean;
  silentAutoSend: boolean;
  startNextMonth: boolean;
  dueDayOfMonth: number | null;
  documentRequestIds: string[];
}): Promise<void> {
  assertUuid("clientId", input.clientId);
  assertUuid("templateId", input.templateId);

  const name = input.name.trim();
  if (!name) throw new Error("Template name is required");

  const due =
    input.dueDayOfMonth === null
      ? null
      : Number.isFinite(input.dueDayOfMonth)
      ? input.dueDayOfMonth
      : null;

  if (due !== null && (due < 1 || due > 31)) {
    throw new Error("Due day must be 1..31");
  }

  const docIds = uniqStrings(input.documentRequestIds);
  if (docIds.length === 0) throw new Error("Select at least one document");
  for (const id of docIds) assertUuid("documentRequestId", id);

  const { supabase, user } = await requireUser();

  // Ensure template belongs to user+client
  const { data: tpl, error: tErr } = await supabase
    .from("request_templates")
    .select("id,client_id")
    .eq("id", input.templateId)
    .eq("user_id", user.id)
    .single<{ id: string; client_id: string }>();

  if (tErr) throw tErr;
  if (!tpl) throw new Error("Template not found");
  if (tpl.client_id !== input.clientId) throw new Error("Template does not belong to this client");

  // Update template settings
  const { error: uErr } = await supabase
    .from("request_templates")
    .update({
      name,
      enabled: input.enabled,
      silent_auto_send: input.silentAutoSend,
      start_next_month: input.startNextMonth,
      due_day_of_month: due,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.templateId)
    .eq("user_id", user.id);

  if (uErr) throw uErr;

  // Replace docs
  await replaceTemplateDocuments({
    templateId: input.templateId,
    clientId: input.clientId,
    documentRequestIds: docIds,
  });
}

export async function deleteRequestTemplate(input: {
  clientId: string;
  templateId: string;
}): Promise<void> {
  assertUuid("clientId", input.clientId);
  assertUuid("templateId", input.templateId);

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("request_templates")
    .delete()
    .eq("id", input.templateId)
    .eq("client_id", input.clientId)
    .eq("user_id", user.id);

  if (error) throw error;
}

/**
 * Creates a session from a template immediately (manual action).
 * Note: due_day_of_month can be passed in (session-specific) from the action.
 */
export async function createSessionFromTemplateNow(input: {
  clientId: string;
  templateId: string;
  dueDayOfMonth: number | null;
}): Promise<{ sessionId: string; publicToken: string }> {
  assertUuid("clientId", input.clientId);
  assertUuid("templateId", input.templateId);

  const { supabase, user } = await requireUser();

  const { data: tpl, error: tErr } = await supabase
    .from("request_templates")
    .select("id,client_id,enabled")
    .eq("id", input.templateId)
    .eq("user_id", user.id)
    .single<{ id: string; client_id: string; enabled: boolean }>();

  if (tErr) throw tErr;
  if (!tpl) throw new Error("Template not found");
  if (!tpl.enabled) throw new Error("Template is disabled");
  if (tpl.client_id !== input.clientId) throw new Error("Template does not belong to this client");

  const { data: rows, error: dErr } = await supabase
    .from("request_template_document_requests")
    .select("document_request_id")
    .eq("request_template_id", input.templateId)
    .eq("user_id", user.id)
    .returns<{ document_request_id: string }[]>();

  if (dErr) throw dErr;

  const docIds = (rows ?? []).map((r) => r.document_request_id);
  if (docIds.length === 0) throw new Error("Template has no documents");

  const created = await createSubmissionSessionForClient({
    clientId: input.clientId,
    documentRequestIds: docIds,
    requestTemplateId: input.templateId,
    sentVia: "manual",
    requestSentAtIso: null,
    // NOTE: if you’ve updated createSubmissionSessionForClient to accept dueDay override,
    // pass it through here. Otherwise we keep relying on your server-side computed due_on.
  });

  return { sessionId: created.id, publicToken: created.public_token };
}
