import Link from "next/link";
import { getClient } from "@/lib/db/clients";
import { listDocumentRequests } from "@/lib/db/documentRequests";
import {
  updateClientAction,
  deleteClientAction,
  updateClientDueSettingsAction,
} from "./actions";

import {
  addDocumentRequestAction,
  updateDocumentRequestAction,
  deleteDocumentRequestAction,
} from "./documents.actions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TIMEZONE_OPTIONS = [
  "Africa/Johannesburg",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

const SAVED_MESSAGES: Record<string, string> = {
  due: "Due settings successfully saved",
  client: "Client successfully updated",
  "doc-added": "Document successfully added",
  "doc-updated": "Document successfully updated",
  "doc-deleted": "Document successfully deleted",
};

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ dueError?: string; saved?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const dueError = sp.dueError ? decodeURIComponent(sp.dueError) : null;
  const saved = sp.saved ?? null;

  if (!UUID_RE.test(id)) {
    return (
      <main className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Invalid client id</h1>
        <p className="opacity-70">
          This doesn’t look like a valid UUID:{" "}
          <span className="font-mono">{id}</span>
        </p>
        <Link className="underline" href="/clients">
          Back to clients
        </Link>
      </main>
    );
  }

  const client = await getClient(id);
  const docs = await listDocumentRequests(id);

  const currentTz = (client.due_timezone ?? "Africa/Johannesburg").trim();
  const isKnownTz = (TIMEZONE_OPTIONS as readonly string[]).includes(currentTz);

  const successMessage = saved ? SAVED_MESSAGES[saved] : null;

  return (
    <main className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{client.name}</h1>

        <div className="text-sm opacity-70 space-y-1">
          {client.email ? <div>Email: {client.email}</div> : null}
          {client.phone_number ? <div>Phone: {client.phone_number}</div> : null}
          <div>
            Public token:{" "}
            <span className="font-mono break-all">{client.public_token}</span>
          </div>
        </div>
      </div>

      {/* ✅ Global success banner (works for ALL forms) */}
      {successMessage ? (
        <div className="border border-green-300 bg-green-50 text-green-800 rounded-lg p-3 text-sm">
          {successMessage} ✅
        </div>
      ) : null}

      {/* Due settings */}
      <section className="space-y-3 border rounded-xl p-4">
        <h2 className="text-lg font-semibold">Due settings</h2>

        {/* Keep due errors here (specific to this section) */}
        {dueError ? (
          <div className="border border-red-300 bg-red-50 text-red-700 rounded-lg p-3 text-sm">
            {dueError}
          </div>
        ) : null}

        <form
          action={updateClientDueSettingsAction.bind(null, client.id)}
          className="space-y-3"
        >
          <div className="space-y-1">
            <label className="text-sm">Due day of month</label>
            <select
              name="due_day_of_month"
              defaultValue={String(client.due_day_of_month ?? 25)}
              className="w-full border rounded-lg p-2"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>
                  {d}
                </option>
              ))}
            </select>
            <p className="text-xs opacity-60">
              If a month has fewer days (e.g. February), it uses the last day of
              that month.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm">Timezone</label>

            <select
              name="due_timezone_select"
              defaultValue={isKnownTz ? currentTz : "__manual__"}
              className="w-full border rounded-lg p-2"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              <option value="__manual__">Other…</option>
            </select>

            <input
              name="due_timezone_manual"
              defaultValue={isKnownTz ? "" : currentTz}
              placeholder='e.g. "America/Sao_Paulo"'
              className="w-full border rounded-lg p-2"
            />

            <p className="text-xs opacity-60">
              Choose from the list. If you pick “Other…”, type an IANA timezone.
            </p>
          </div>

          <button className="border rounded-lg px-4 py-2">
            Save due settings
          </button>
        </form>
      </section>

      {/* Documents required */}
      <section className="space-y-4 border rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Documents required</h2>
          <div className="text-sm opacity-70">
            {docs.filter((d) => d.active && d.required).length} required
          </div>
        </div>

        {/* Add new doc */}
        <form
          action={addDocumentRequestAction.bind(null, client.id)}
          className="space-y-3"
        >
          <div className="space-y-1">
            <label className="text-sm">New document name</label>
            <input
              name="title"
              required
              className="w-full border rounded-lg p-2"
              placeholder="e.g. Bank statement"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm">Instructions (optional)</label>
            <textarea
              name="description"
              className="w-full border rounded-lg p-2"
              rows={3}
              placeholder="e.g. Latest 3 months, PDF preferred"
            />
          </div>

          <button className="border rounded-lg px-4 py-2">Add document</button>
        </form>

        <div className="border-t pt-4" />

        {/* Existing docs */}
        {docs.length === 0 ? (
          <div className="opacity-70 text-sm">No documents set yet.</div>
        ) : (
          <ul className="space-y-3">
            {docs.map((d) => (
              <li key={d.id} className="border rounded-xl p-3 space-y-2">
                <form
                  action={updateDocumentRequestAction.bind(null, client.id, d.id)}
                  className="space-y-2"
                >
                  <div className="space-y-1">
                    <label className="text-sm">Document name</label>
                    <input
                      name="title"
                      required
                      defaultValue={d.title ?? ""}
                      className="w-full border rounded-lg p-2"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm">Instructions</label>
                    <textarea
                      name="description"
                      defaultValue={d.description ?? ""}
                      className="w-full border rounded-lg p-2"
                      rows={3}
                    />
                  </div>

                  <div className="flex flex-col gap-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="required"
                        defaultChecked={!!d.required}
                      />
                      Required
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={!!d.active}
                      />
                      Active
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <button className="border rounded-lg px-4 py-2">Save</button>

                    <span className="text-xs opacity-60">
                      {d.active ? "Visible" : "Hidden"} ·{" "}
                      {d.required ? "Required" : "Optional"}
                    </span>
                  </div>
                </form>

                {/* Delete */}
                <form
                  action={deleteDocumentRequestAction.bind(null, client.id, d.id)}
                >
                  <button className="text-sm underline text-red-600">
                    Delete document
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Edit client */}
      <section className="space-y-3 border rounded-xl p-4">
        <h2 className="text-lg font-semibold">Edit client</h2>

        <form
          action={updateClientAction.bind(null, client.id)}
          className="space-y-3"
        >
          <div className="space-y-1">
            <label className="text-sm">Name</label>
            <input
              name="name"
              required
              defaultValue={client.name ?? ""}
              className="w-full border rounded-lg p-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={client.email ?? ""}
              className="w-full border rounded-lg p-2"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm">Phone</label>
            <input
              name="phone_number"
              defaultValue={client.phone_number ?? ""}
              className="w-full border rounded-lg p-2"
            />
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="active"
                defaultChecked={!!client.active}
              />
              Active
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="portal_enabled"
                defaultChecked={!!client.portal_enabled}
              />
              Portal enabled
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="notify_by_email"
                defaultChecked={!!client.notify_by_email}
              />
              Notify by email
            </label>
          </div>

          <button className="border rounded-lg px-4 py-2">Save changes</button>
        </form>
      </section>

      {/* Delete client */}
      <section className="space-y-2 border rounded-xl p-4">
        <h2 className="text-lg font-semibold text-red-600">Danger zone</h2>

        <form action={deleteClientAction.bind(null, client.id)}>
          <button className="border rounded-lg px-4 py-2">Delete client</button>
        </form>

        <p className="text-xs opacity-60">
          Deleting a client will permanently remove their document requests,
          uploads, reminder schedules, and notification logs.
        </p>
      </section>

      <Link className="underline" href="/clients">
        Back
      </Link>
    </main>
  );
}
