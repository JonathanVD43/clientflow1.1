// src/app/clients/[id]/page.tsx
// Manage client detail page
import Link from "next/link";
import { getClient } from "@/lib/db/clients";
import { listDocumentRequests } from "@/lib/db/documentRequests";
import {
  listRequestTemplatesForClient,
  listTemplateDocuments,
  type RequestTemplateRow,
  type TemplateDocumentRow,
} from "@/lib/db/requestTemplates";

import { updateClientAction, deleteClientAction } from "./actions";

import {
  addDocumentRequestAction,
  updateDocumentRequestAction,
  deleteDocumentRequestAction,
} from "./documents.actions";

import { createRequestLinkAction } from "./request-link.actions";

import {
  createRequestTemplateAction,
  saveTemplateAction,
  sendTemplateNowAction,
  deleteTemplateAction,
} from "./templates.actions";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SAVED_MESSAGES: Record<string, string> = {
  created: "Client successfully created",
  client: "Client successfully updated",
  deleted: "Client successfully deleted",
  doc_added: "Document successfully added",
  doc_updated: "Document successfully updated",
  doc_deleted: "Document successfully deleted",
  template_created: "Template created",
  template_updated: "Template updated",
  template_sent: "Template sent",
  template_deleted: "Template deleted",
  request_link_created: "Request link created",
};

type DocRow = Awaited<ReturnType<typeof listDocumentRequests>>[number];

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function DueDayTooLowBanner({ dueDay }: { dueDay: number }) {
  return (
    <Alert variant="warning">
      <div className="space-y-1">
        <div className="font-medium">Due day too low for 14-day reminders</div>
        <div className="opacity-90">
          Your due day is <strong>{dueDay}</strong>. A “14 days before due date”
          reminder would fall in the previous month, so it won’t be sent.
        </div>
        <div className="text-xs opacity-70">
          Set due day to <strong>15–31</strong> to enable reminders.
        </div>
      </div>
    </Alert>
  );
}

// Pane titles
function PaneTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      {subtitle ? (
        <div className="text-xs text-slate-500">{subtitle}</div>
      ) : null}
    </div>
  );
}

function SmallLinkButton({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      href={href}
      prefetch={false}
    >
      {children}
    </Link>
  );
}

function getLower(s: unknown, fallback: string) {
  const v = typeof s === "string" ? s.trim().toLowerCase() : "";
  return v || fallback;
}

function buildClientUrl(args: {
  clientId: string;
  lib: "docs" | "templates";
  edit: "docs" | "templates";
  docId?: string | null;
  templateId?: string | null;
  saved?: string | null;
  error?: string | null;
  requestToken?: string | null;
  requestError?: string | null;
}) {
  const qp = new URLSearchParams();
  qp.set("lib", args.lib);
  qp.set("edit", args.edit);
  if (args.docId) qp.set("docId", args.docId);
  if (args.templateId) qp.set("templateId", args.templateId);
  if (args.saved) qp.set("saved", args.saved);
  if (args.error) qp.set("error", args.error);
  if (args.requestToken) qp.set("requestToken", args.requestToken);
  if (args.requestError) qp.set("requestError", args.requestError);
  return `/clients/${args.clientId}?${qp.toString()}`;
}

function coerceTemplateDueDay(t: RequestTemplateRow | null): number | null {
  if (!t) return null;

  // Template due day may not exist on the TS type yet.
  const v = (t as unknown as { due_day_of_month?: unknown }).due_day_of_month;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    lib?: string; // RIGHT pane tab
    edit?: string; // MIDDLE pane tab
    docId?: string;
    templateId?: string;

    saved?: string;
    error?: string;

    requestToken?: string;
    requestError?: string;
  }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  if (!UUID_RE.test(id)) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-2xl">
          <Card className="p-0">
            <CardHeader>
              <h1 className="text-xl font-semibold text-slate-900">
                Invalid client id
              </h1>
              <p className="text-sm text-slate-600">
                This doesn’t look like a valid UUID:{" "}
                <span className="font-mono text-slate-900">{id}</span>
              </p>
            </CardHeader>
            <CardContent>
              <Link className="text-sm underline" href="/clients">
                Back to clients
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const client = await getClient(id);
  const docs = await listDocumentRequests(id);
  const templates: RequestTemplateRow[] = await listRequestTemplatesForClient(
    id
  );

  // RIGHT pane
  const lib = (
    getLower(sp.lib, "templates") === "docs" ? "docs" : "templates"
  ) as "docs" | "templates";

  // MIDDLE pane (independent)
  const edit = (
    getLower(sp.edit, "templates") === "docs" ? "docs" : "templates"
  ) as "docs" | "templates";

  const docId = typeof sp.docId === "string" ? sp.docId : null;
  const templateId = typeof sp.templateId === "string" ? sp.templateId : null;

  const selectedDoc =
    edit === "docs" && docId ? docs.find((d) => d.id === docId) ?? null : null;

  const selectedTemplate =
    edit === "templates" && templateId
      ? templates.find((t) => t.id === templateId) ?? null
      : null;

  const templateDocs: TemplateDocumentRow[] = selectedTemplate
    ? await listTemplateDocuments(selectedTemplate.id)
    : [];

  const saved = typeof sp.saved === "string" ? sp.saved : null;
  const successMessage = saved ? SAVED_MESSAGES[saved] ?? null : null;

  const error =
    typeof sp.error === "string" && sp.error.trim()
      ? decodeURIComponent(sp.error)
      : null;

  const requestError =
    typeof sp.requestError === "string" && sp.requestError.trim()
      ? decodeURIComponent(sp.requestError)
      : null;

  const requestToken =
    typeof sp.requestToken === "string" && sp.requestToken.trim()
      ? decodeURIComponent(sp.requestToken)
      : null;

  const origin = (
    process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");

  const requestLink = requestToken
    ? origin
      ? `${origin}/portal/${requestToken}`
      : `/portal/${requestToken}`
    : null;

  const clientDefaultDueDay = Number(client.due_day_of_month ?? 25);

  const selectedTemplateDueDay = coerceTemplateDueDay(selectedTemplate);
  const templateDueDayForUI = selectedTemplateDueDay ?? clientDefaultDueDay;

  return (
    <main className="h-dvh overflow-hidden bg-slate-50">
      <div className="box-border flex h-full min-h-0 w-full flex-col gap-4 p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold text-slate-900">
              {client.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              {client.email ? (
                <span className="truncate">{client.email}</span>
              ) : (
                <span className="opacity-70">No email</span>
              )}
              <span className="opacity-40">·</span>
              <Link className="underline" href={`/inbox/client/${client.id}`}>
                Client inbox
              </Link>
              <span className="opacity-40">·</span>
              <Link className="underline" href="/inbox">
                Inbox
              </Link>
              <span className="opacity-40">·</span>
              <Link className="underline" href="/clients">
                Clients
              </Link>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <SmallLinkButton href={`/inbox/client/${client.id}`}>
              Open client inbox
            </SmallLinkButton>
          </div>
        </div>

        {successMessage ? (
          <Alert variant="success">{successMessage} ✅</Alert>
        ) : null}
        {error ? <Alert variant="error">{error}</Alert> : null}

        {/* 3 panes */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-12">
          {/* LEFT */}
          <aside className="min-h-0 lg:col-span-3">
            <Card className="flex h-full min-h-0 flex-col overflow-hidden">
              <CardHeader>
                <PaneTitle
                  title="Client Information"
                  subtitle="Basic client information and settings"
                />
              </CardHeader>

              {/* ✅ change: keep Save button pinned; scroll only the fields */}
              <CardContent className="min-h-0 flex-1 overflow-hidden pr-1">
                <form
                  action={updateClientAction.bind(null, client.id)}
                  className="flex h-full min-h-0 flex-col"
                >
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-600">
                          Name
                        </label>
                        <Input
                          name="name"
                          required
                          defaultValue={client.name ?? ""}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-600">
                          Email
                        </label>
                        <Input
                          name="email"
                          type="email"
                          defaultValue={client.email ?? ""}
                        />
                      </div>

                      <div className="pt-4">
                        <div className="h-px bg-slate-100" />
                        <div className="mt-4 space-y-2 text-sm text-slate-700">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              name="active"
                              defaultChecked={Boolean(client.active)}
                            />
                            Active
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              name="portal_enabled"
                              defaultChecked={Boolean(client.portal_enabled)}
                            />
                            Portal enabled
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              name="notify_by_email"
                              defaultChecked={Boolean(client.notify_by_email)}
                            />
                            Notify by email
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3">
                    <Button variant="primary" className="w-full">
                      Save client
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </aside>

          {/* MIDDLE */}
          <section className="min-h-0 lg:col-span-6">
            <Card className="flex h-full min-h-0 flex-col overflow-hidden">
              <CardHeader className="pb-0">
                <div className="flex items-start justify-between gap-3">
                  <PaneTitle
                    title="Editor"
                    subtitle={
                      edit === "docs"
                        ? selectedDoc
                          ? "Edit selected document"
                          : "Create a new document"
                        : selectedTemplate
                        ? "Edit selected template"
                        : "Create a new template"
                    }
                  />

                  <div className="flex gap-2">
                    <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                      <Link
                        href={buildClientUrl({
                          clientId: client.id,
                          lib,
                          edit: "templates",
                          docId: null,
                          templateId,
                        })}
                        className={cls(
                          "rounded-lg px-3 py-1.5 font-medium",
                          edit === "templates"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                        prefetch={false}
                      >
                        Templates
                      </Link>
                      <Link
                        href={buildClientUrl({
                          clientId: client.id,
                          lib,
                          edit: "docs",
                          docId,
                          templateId: null,
                        })}
                        className={cls(
                          "rounded-lg px-3 py-1.5 font-medium",
                          edit === "docs"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                        prefetch={false}
                      >
                        Docs
                      </Link>
                    </div>

                    <SmallLinkButton
                      href={buildClientUrl({
                        clientId: client.id,
                        lib,
                        edit,
                        docId: null,
                        templateId: null,
                      })}
                    >
                      Clear
                    </SmallLinkButton>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-4">
                  {/* DOCS EDITOR */}
                  {edit === "docs" ? (
                    selectedDoc ? (
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">
                          Edit document
                        </div>

                        <form
                          action={updateDocumentRequestAction.bind(
                            null,
                            client.id,
                            selectedDoc.id
                          )}
                          className="space-y-3"
                        >
                          <input type="hidden" name="lib" value={lib} />
                          <input type="hidden" name="edit" value={edit} />
                          <input
                            type="hidden"
                            name="docId"
                            value={selectedDoc.id}
                          />

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">
                              Title
                            </label>
                            <Input
                              name="title"
                              required
                              defaultValue={selectedDoc.title ?? ""}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">
                              Description
                            </label>
                            <textarea
                              name="description"
                              defaultValue={selectedDoc.description ?? ""}
                              rows={4}
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm text-slate-700">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="required"
                                defaultChecked={Boolean(selectedDoc.required)}
                              />
                              Required
                            </label>

                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="active"
                                defaultChecked={Boolean(selectedDoc.active)}
                              />
                              Active
                            </label>

                            <label className="col-span-2 flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="recurring"
                                defaultChecked={Boolean(
                                  (
                                    selectedDoc as unknown as {
                                      recurring?: boolean | null;
                                    }
                                  ).recurring
                                )}
                              />
                              Recurring (monthly template eligible)
                            </label>
                          </div>

                          <Button className="w-full">Save document</Button>
                        </form>

                        <form
                          action={deleteDocumentRequestAction.bind(
                            null,
                            client.id,
                            selectedDoc.id
                          )}
                        >
                          <input type="hidden" name="lib" value={lib} />
                          <input type="hidden" name="edit" value={edit} />
                          <Button variant="danger" className="w-full">
                            Delete document
                          </Button>
                        </form>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">
                          Create document
                        </div>

                        <form
                          action={addDocumentRequestAction.bind(
                            null,
                            client.id
                          )}
                          className="space-y-3"
                        >
                          <input type="hidden" name="lib" value={lib} />
                          <input type="hidden" name="edit" value={edit} />

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">
                              Title
                            </label>
                            <Input
                              name="title"
                              required
                              placeholder="e.g. Bank statement"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">
                              Description
                            </label>
                            <textarea
                              name="description"
                              rows={4}
                              placeholder="e.g. Latest 3 months, PDF preferred"
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                            />
                          </div>

                          <Button variant="primary" className="w-full">
                            Create document
                          </Button>
                        </form>
                      </div>
                    )
                  ) : null}

                  {/* TEMPLATES EDITOR */}
                  {edit === "templates" ? (
                    selectedTemplate ? (
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">
                          Edit template
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                          <div className="font-medium text-slate-900">
                            {selectedTemplate.name}
                          </div>
                          <div className="text-xs text-slate-600">
                            Monthly ·{" "}
                            {selectedTemplate.silent_auto_send
                              ? "silent auto-send"
                              : "manual"}{" "}
                            ·{" "}
                            {selectedTemplate.start_next_month
                              ? "starts next month"
                              : "eligible immediately"}
                          </div>
                        </div>

                        {templateDueDayForUI <= 14 ? (
                          <DueDayTooLowBanner dueDay={templateDueDayForUI} />
                        ) : null}

                        <form
                          action={saveTemplateAction.bind(
                            null,
                            client.id,
                            selectedTemplate.id
                          )}
                          className="space-y-2"
                        >
                          <input type="hidden" name="lib" value={lib} />
                          <input type="hidden" name="edit" value={edit} />
                          <input
                            type="hidden"
                            name="templateId"
                            value={selectedTemplate.id}
                          />

                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              name="enabled"
                              defaultChecked={Boolean(selectedTemplate.enabled)}
                            />
                            Enabled
                          </label>

                          <Button className="w-full">
                            Save template status
                          </Button>
                        </form>

                        <Card>
                          <CardHeader className="pb-0">
                            <div className="text-sm font-semibold text-slate-900">
                              Template documents
                            </div>
                          </CardHeader>
                          <CardContent>
                            {templateDocs.length === 0 ? (
                              <div className="text-sm text-slate-600">
                                No documents in this template yet.
                              </div>
                            ) : (
                              <ul className="space-y-1">
                                {templateDocs.map((d) => (
                                  <li
                                    key={`td-${d.document_request_id}`}
                                    className="text-sm text-slate-700"
                                  >
                                    • {d.title ?? "(untitled)"}{" "}
                                    {!d.active ? (
                                      <span className="text-xs text-slate-500">
                                        (inactive)
                                      </span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </CardContent>
                        </Card>

                        <details className="rounded-xl border border-slate-200 bg-white p-3">
                          <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                            Edit template documents
                          </summary>

                          <form
                            action={saveTemplateAction.bind(
                              null,
                              client.id,
                              selectedTemplate.id
                            )}
                            className="mt-3 space-y-2"
                          >
                            <input type="hidden" name="lib" value={lib} />
                            <input type="hidden" name="edit" value={edit} />
                            <input
                              type="hidden"
                              name="templateId"
                              value={selectedTemplate.id}
                            />

                            <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white p-2">
                              <ul className="space-y-1">
                                {docs
                                  .filter((d) => d.active)
                                  .map((d) => {
                                    const checked = templateDocs.some(
                                      (x) => x.document_request_id === d.id
                                    );
                                    return (
                                      <li
                                        key={`tplpick-${d.id}`}
                                        className="text-sm"
                                      >
                                        <label className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            name="template_document_request_id"
                                            value={d.id}
                                            defaultChecked={checked}
                                          />
                                          <span className="truncate">
                                            {d.title}
                                          </span>
                                        </label>
                                      </li>
                                    );
                                  })}
                              </ul>
                            </div>

                            <Button className="w-full">
                              Save template documents
                            </Button>
                          </form>
                        </details>

                        <form
                          action={sendTemplateNowAction.bind(
                            null,
                            client.id,
                            selectedTemplate.id
                          )}
                          className="space-y-2"
                        >
                          <input type="hidden" name="lib" value={lib} />
                          <input type="hidden" name="edit" value={edit} />
                          <input
                            type="hidden"
                            name="templateId"
                            value={selectedTemplate.id}
                          />

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">
                              Due day of month (for this session)
                            </label>
                            <select
                              name="due_day_of_month"
                              defaultValue={String(templateDueDayForUI)}
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                            >
                              {Array.from({ length: 31 }, (_, i) => i + 1).map(
                                (d) => (
                                  <option key={d} value={String(d)}>
                                    {d}
                                  </option>
                                )
                              )}
                            </select>
                            <div className="text-xs text-slate-500">
                              Reminder sends 14 days before due day (if due day
                              ≥ 15).
                            </div>
                          </div>

                          <input
                            type="hidden"
                            name="due_timezone_select"
                            value="Africa/Johannesburg"
                          />
                          <input
                            type="hidden"
                            name="due_timezone_manual"
                            value="Africa/Johannesburg"
                          />

                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" name="send_email_now" />
                            Email link to client (requires client email)
                          </label>

                          <Button variant="primary" className="w-full">
                            Send this template now
                          </Button>
                        </form>

                        <form
                          action={deleteTemplateAction.bind(
                            null,
                            client.id,
                            selectedTemplate.id
                          )}
                        >
                          <input type="hidden" name="lib" value={lib} />
                          <input type="hidden" name="edit" value={edit} />
                          <Button variant="danger" className="w-full">
                            Delete template
                          </Button>
                        </form>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">
                          Create template
                        </div>

                        {clientDefaultDueDay <= 14 ? (
                          <DueDayTooLowBanner dueDay={clientDefaultDueDay} />
                        ) : null}

                        <form
                          action={createRequestTemplateAction.bind(
                            null,
                            client.id
                          )}
                          className="space-y-3"
                        >
                          <input type="hidden" name="lib" value={lib} />
                          <input type="hidden" name="edit" value={edit} />

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">
                              Template name
                            </label>
                            <Input
                              name="template_name"
                              required
                              placeholder="Monthly tax requirements"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">
                              Due day of month (template default)
                            </label>
                            <select
                              name="due_day_of_month"
                              defaultValue={String(clientDefaultDueDay)}
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                            >
                              {Array.from({ length: 31 }, (_, i) => i + 1).map(
                                (d) => (
                                  <option key={d} value={String(d)}>
                                    {d}
                                  </option>
                                )
                              )}
                            </select>
                            <div className="text-xs text-slate-500">
                              Reminder sends 14 days before due day (if due day
                              ≥ 15).
                            </div>
                          </div>

                          <input
                            type="hidden"
                            name="due_timezone_select"
                            value="Africa/Johannesburg"
                          />
                          <input
                            type="hidden"
                            name="due_timezone_manual"
                            value="Africa/Johannesburg"
                          />

                          <div className="space-y-1">
                            <div className="text-xs font-medium text-slate-600">
                              Select documents
                            </div>
                            <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white p-2">
                              {docs.filter((d) => d.active).length === 0 ? (
                                <div className="text-sm text-slate-600">
                                  No active documents yet.
                                </div>
                              ) : (
                                <ul className="space-y-1">
                                  {docs
                                    .filter((d) => d.active)
                                    .map((d) => (
                                      <li
                                        key={`ct-${d.id}`}
                                        className="text-sm"
                                      >
                                        <label className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            name="template_document_request_id"
                                            value={d.id}
                                            defaultChecked={Boolean(d.required)}
                                          />
                                          <span className="truncate">
                                            {d.title}
                                          </span>
                                        </label>
                                      </li>
                                    ))}
                                </ul>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2 text-sm text-slate-700">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="silent_auto_send"
                                defaultChecked
                              />
                              Silent auto-send (no approval each month)
                            </label>

                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                name="start_next_month"
                                defaultChecked
                              />
                              Start next month
                            </label>

                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="text-sm font-semibold text-slate-900">
                                Optional
                              </div>
                              <label className="mt-2 flex items-center gap-2 text-sm">
                                <input type="checkbox" name="send_first_now" />
                                Create a session immediately
                              </label>
                              <label className="mt-2 flex items-center gap-2 text-sm">
                                <input type="checkbox" name="send_email_now" />
                                Also email the link to the client
                              </label>
                            </div>
                          </div>

                          <Button variant="primary" className="w-full">
                            Create template
                          </Button>
                        </form>
                      </div>
                    )
                  ) : null}

                  {/* One-time request link (under editor) */}
                  <div className="h-px bg-slate-100" />

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-900">
                      One-time request link
                    </div>
                    <div className="text-xs text-slate-600">
                      Create a one-off session for selected docs (manual).
                    </div>

                    {clientDefaultDueDay <= 14 ? (
                      <div className="mt-2">
                        <DueDayTooLowBanner dueDay={clientDefaultDueDay} />
                      </div>
                    ) : null}

                    {requestError ? (
                      <Alert variant="error" className="mt-2">
                        {requestError}
                      </Alert>
                    ) : null}

                    {requestLink ? (
                      <Alert variant="success" className="mt-2">
                        <span className="mr-2">Link created ✅</span>
                        <span className="font-mono break-all">
                          {requestLink}
                        </span>
                      </Alert>
                    ) : null}

                    <form
                      action={createRequestLinkAction.bind(null, client.id)}
                      className="mt-3 space-y-2"
                    >
                      <input type="hidden" name="lib" value={lib} />
                      <input type="hidden" name="edit" value={edit} />

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-600">
                          Due day of month
                        </label>
                        <select
                          name="due_day_of_month"
                          defaultValue={String(clientDefaultDueDay)}
                          className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(
                            (d) => (
                              <option key={d} value={String(d)}>
                                {d}
                              </option>
                            )
                          )}
                        </select>
                        <div className="text-xs text-slate-500">
                          Reminder sends 14 days before due day (if due day ≥
                          15).
                        </div>
                      </div>

                      <input
                        type="hidden"
                        name="due_timezone_select"
                        value="Africa/Johannesburg"
                      />
                      <input
                        type="hidden"
                        name="due_timezone_manual"
                        value="Africa/Johannesburg"
                      />

                      <div className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-white p-2">
                        <ul className="space-y-1">
                          {docs
                            .filter((d) => d.active)
                            .map((d) => (
                              <li key={`req-${d.id}`} className="text-sm">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    name="document_request_id"
                                    value={d.id}
                                    defaultChecked={Boolean(d.required)}
                                  />
                                  <span className="truncate">{d.title}</span>
                                </label>
                              </li>
                            ))}
                        </ul>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" name="send_email_now" />
                        Email link to client (requires client email)
                      </label>

                      <Button variant="primary" className="w-full">
                        Create request link
                      </Button>
                    </form>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* RIGHT */}
          <aside className="min-h-0 lg:col-span-3">
            <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <CardHeader className="border-b border-slate-100">
                  <div className="flex items-center justify-between gap-2">
                    <PaneTitle
                      title="Library"
                      subtitle={lib === "docs" ? "Documents" : "Templates"}
                    />

                    <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                      <Link
                        href={buildClientUrl({
                          clientId: client.id,
                          lib: "templates",
                          edit,
                          docId,
                          templateId,
                        })}
                        className={cls(
                          "rounded-lg px-3 py-1.5 font-medium",
                          lib === "templates"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                        prefetch={false}
                      >
                        Templates
                      </Link>
                      <Link
                        href={buildClientUrl({
                          clientId: client.id,
                          lib: "docs",
                          edit,
                          docId,
                          templateId,
                        })}
                        className={cls(
                          "rounded-lg px-3 py-1.5 font-medium",
                          lib === "docs"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                        prefetch={false}
                      >
                        Docs
                      </Link>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="min-h-0 flex-1 overflow-y-auto p-3">
                  {lib === "docs" ? (
                    docs.length === 0 ? (
                      <div className="p-3 text-sm text-slate-600">
                        No documents yet.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {docs.map((d: DocRow) => (
                          <li
                            key={`doc-${d.id}`}
                            className="rounded-xl border border-slate-200 bg-white p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {d.title ?? "(untitled)"}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {d.active ? "Active" : "Inactive"} ·{" "}
                                  {d.required ? "Required" : "Optional"}
                                </div>
                              </div>

                              <SmallLinkButton
                                href={buildClientUrl({
                                  clientId: client.id,
                                  lib,
                                  edit: "docs",
                                  docId: d.id,
                                  templateId: null,
                                })}
                              >
                                Open
                              </SmallLinkButton>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : templates.length === 0 ? (
                    <div className="p-3 text-sm text-slate-600">
                      No templates yet.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {templates.map((t) => (
                        <li
                          key={`tpl-${t.id}`}
                          className="rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {t.name}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {t.enabled ? "Enabled" : "Disabled"} · monthly
                              </div>
                            </div>

                            <SmallLinkButton
                              href={buildClientUrl({
                                clientId: client.id,
                                lib,
                                edit: "templates",
                                docId: null,
                                templateId: t.id,
                              })}
                            >
                              Open
                            </SmallLinkButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>

                <div className="border-t border-slate-100 p-3">
                  <div className="text-xs text-slate-500">
                    The page won’t scroll — only this list scrolls.
                  </div>
                </div>
              </Card>

              <Card className="border-red-200 bg-red-50">
                <CardHeader className="pb-0">
                  <div className="text-sm font-semibold text-red-700">
                    Danger zone
                  </div>
                  <div className="mt-1 text-xs text-red-700/80">
                    Deleting a client removes templates, docs, uploads,
                    sessions, reminders, and outbox logs.
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  <form action={deleteClientAction.bind(null, client.id)}>
                    <Button className="w-full" variant="danger">
                      Delete client
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </aside>
        </div>

        <div className="text-sm text-slate-600">
          <Link className="underline" href="/clients">
            Back to clients
          </Link>
        </div>
      </div>
    </main>
  );
}
