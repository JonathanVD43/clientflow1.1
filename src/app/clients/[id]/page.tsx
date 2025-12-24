// src/app/clients/[id]/page.tsx
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
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="font-medium">Due day too low for 14-day reminders</div>
      <div className="opacity-90">
        Your due day is <strong>{dueDay}</strong>. A “14 days before due date”
        reminder would fall in the previous month, so it won’t be sent.
      </div>
      <div className="text-xs opacity-70">
        Set due day to <strong>15–31</strong> to enable reminders.
      </div>
    </div>
  );
}

function PaneTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {subtitle ? (
        <div className="text-xs text-slate-500">{subtitle}</div>
      ) : null}
    </div>
  );
}

function SmallButton({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
        <div className="mx-auto max-w-2xl space-y-2 rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold text-slate-900">Invalid client id</h1>
          <p className="text-sm text-slate-600">
            This doesn’t look like a valid UUID:{" "}
            <span className="font-mono text-slate-900">{id}</span>
          </p>
          <Link className="text-sm underline" href="/clients">
            Back to clients
          </Link>
        </div>
      </main>
    );
  }

  const client = await getClient(id);
  const docs = await listDocumentRequests(id);
  const templates: RequestTemplateRow[] = await listRequestTemplatesForClient(id);

  // RIGHT pane
  const lib = (getLower(sp.lib, "templates") === "docs" ? "docs" : "templates") as
    | "docs"
    | "templates";

  // MIDDLE pane (independent)
  const edit = (getLower(sp.edit, "templates") === "docs" ? "docs" : "templates") as
    | "docs"
    | "templates";

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

  // Default due day fallback (still on client for now, but sessions/templates override).
  const clientDefaultDueDay = Number(client.due_day_of_month ?? 25);

  const selectedTemplateDueDay = coerceTemplateDueDay(selectedTemplate);
  const templateDueDayForUI = selectedTemplateDueDay ?? clientDefaultDueDay;

  // IMPORTANT: no page scroll. All scrolling must be inside panes.
  return (
    <main className="h-[100dvh] overflow-hidden bg-slate-50">
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
            <SmallButton href={`/inbox/client/${client.id}`}>
              Open client inbox
            </SmallButton>
          </div>
        </div>

        {successMessage ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {successMessage} ✅
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* 3 panes */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-12">
          {/* LEFT */}
          <aside className="min-h-0 lg:col-span-3">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <PaneTitle title="Client settings" subtitle="Basic client settings" />

              {/* ✅ scroll region must be flex-1/min-h-0 (not h-full) */}
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-4">
                  <form
                    action={updateClientAction.bind(null, client.id)}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">
                        Name
                      </label>
                      <input
                        name="name"
                        required
                        defaultValue={client.name ?? ""}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">
                        Email
                      </label>
                      <input
                        name="email"
                        type="email"
                        defaultValue={client.email ?? ""}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">
                        Phone
                      </label>
                      <input
                        name="phone_number"
                        defaultValue={client.phone_number ?? ""}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
                      />
                    </div>

                    <div className="space-y-2 pt-1 text-sm text-slate-700">
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

                    <button className="w-full rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                      Save client
                    </button>
                  </form>

                  <form action={deleteClientAction.bind(null, client.id)}>
                    <button className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                      Delete client
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </aside>

          {/* MIDDLE */}
          <section className="min-h-0 lg:col-span-6">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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

                  <SmallButton
                    href={buildClientUrl({
                      clientId: client.id,
                      lib,
                      edit,
                      docId: null,
                      templateId: null,
                    })}
                  >
                    Clear
                  </SmallButton>
                </div>
              </div>

              {/* ✅ scroll region must be flex-1/min-h-0 (not h-full) */}
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
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
                            <input
                              name="title"
                              required
                              defaultValue={selectedDoc.title ?? ""}
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
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
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
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
                                  (selectedDoc as unknown as { recurring?: boolean | null })
                                    .recurring
                                )}
                              />
                              Recurring (monthly template eligible)
                            </label>
                          </div>

                          <button className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50">
                            Save document
                          </button>
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
                          <button className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                            Delete document
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-slate-900">
                          Create document
                        </div>

                        <form
                          action={addDocumentRequestAction.bind(null, client.id)}
                          className="space-y-3"
                        >
                          <input type="hidden" name="lib" value={lib} />
                          <input type="hidden" name="edit" value={edit} />

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">
                              Title
                            </label>
                            <input
                              name="title"
                              required
                              placeholder="e.g. Bank statement"
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
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
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
                            />
                          </div>

                          <button className="w-full rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                            Create document
                          </button>
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
                          <button className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50">
                            Save template status
                          </button>
                        </form>

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="text-sm font-semibold text-slate-900">
                            Template documents
                          </div>
                          <div className="mt-2 space-y-1">
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
                          </div>
                        </div>

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

                            <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
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

                            <button className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50">
                              Save template documents
                            </button>
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
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
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

                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" name="send_email_now" />
                            Email link to client (requires client email)
                          </label>

                          <button className="w-full rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                            Send this template now
                          </button>
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
                          <button className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                            Delete template
                          </button>
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
                            <input
                              name="template_name"
                              required
                              placeholder="Monthly tax requirements"
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-medium text-slate-600">
                              Due day of month (template default)
                            </label>
                            <select
                              name="due_day_of_month"
                              defaultValue={String(clientDefaultDueDay)}
                              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
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

                          <div className="space-y-1">
                            <div className="text-xs font-medium text-slate-600">
                              Select documents
                            </div>
                            <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
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

                          <button className="w-full rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                            Create template
                          </button>
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
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                        {requestError}
                      </div>
                    ) : null}

                    {requestLink ? (
                      <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-800">
                        Link created ✅{" "}
                        <span className="font-mono break-all text-green-900">
                          {requestLink}
                        </span>
                      </div>
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
                          className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-slate-300"
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
                          Reminder sends 14 days before due day (if due day ≥ 15).
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

                      <div className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
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

                      <button className="w-full rounded-xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                        Create request link
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT */}
          <aside className="min-h-0 lg:col-span-3">
            <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4">
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
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
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

                              <SmallButton
                                href={buildClientUrl({
                                  clientId: client.id,
                                  lib,
                                  edit: "docs",
                                  docId: d.id,
                                  templateId: null,
                                })}
                              >
                                Open
                              </SmallButton>
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

                            <SmallButton
                              href={buildClientUrl({
                                clientId: client.id,
                                lib,
                                edit: "templates",
                                docId: null,
                                templateId: t.id,
                              })}
                            >
                              Open
                            </SmallButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border-t border-slate-100 p-3">
                  <div className="text-xs text-slate-500">
                    The page won’t scroll — only this list scrolls.
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
                <div className="text-sm font-semibold text-red-700">
                  Danger zone
                </div>
                <div className="mt-1 text-xs text-red-700/80">
                  Deleting a client removes templates, docs, uploads, sessions,
                  reminders, and outbox logs.
                </div>

                <form action={deleteClientAction.bind(null, client.id)} className="mt-3">
                  <button className="w-full rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
                    Delete client
                  </button>
                </form>
              </div>
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
