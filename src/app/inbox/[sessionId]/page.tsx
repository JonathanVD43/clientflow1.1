// src/app/inbox/[sessionId]/page.tsx
import {
  listPendingUploadsForSession,
  getSessionReviewSummary,
} from "@/lib/db/uploads";
import { requestReplacementsAction } from "./actions";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Alert } from "@/components/ui/alert";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "danger" | "warning";
}) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

  const styles =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-white text-slate-700";

  return <span className={`${base} ${styles}`}>{children}</span>;
}

function expiresInLabel(deleteAfter: string | null) {
  if (!deleteAfter) return "—";
  const ms = new Date(deleteAfter).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "expired";

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);

  if (days > 0) return `expires in ${days}d ${hours}h`;
  return `expires in ${hours}h`;
}

export default async function InboxSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ error?: string; saved?: string }>;
}) {
  const { sessionId } = await params;
  const sp = (await searchParams) ?? {};
  const error = sp.error ? decodeURIComponent(sp.error) : null;
  const saved = sp.saved ? decodeURIComponent(sp.saved) : null;

  if (!UUID_RE.test(sessionId)) {
    return (
      <main className="p-6">
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-semibold text-slate-900">
                Invalid session
              </h1>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                This doesn’t look like a valid UUID:{" "}
                <span className="font-mono">{sessionId}</span>
              </p>
              <div className="mt-3">
                <LinkButton href="/inbox" variant="secondary" size="sm">
                  Back to inbox
                </LinkButton>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const pendingBundle = await listPendingUploadsForSession(sessionId);
  const hasPending = pendingBundle.uploads.length > 0;

  /* ───────────────────────── Pending queue ───────────────────────── */

  if (hasPending) {
    const { client, session, uploads } = pendingBundle;

    return (
      <main className="p-6">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {/* Header */}
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              Review queue
            </h1>
            <div className="text-sm text-slate-600">
              Client:{" "}
              <span className="font-medium text-slate-900">{client.name}</span>
            </div>
            <div className="text-xs text-slate-500">
              Session <span className="font-mono">{session.id}</span> · Opened{" "}
              {fmt(session.opened_at)}
            </div>

            <div className="flex gap-2 pt-2">
              <LinkButton href="/inbox" variant="secondary" size="sm">
                Back to inbox
              </LinkButton>
              <LinkButton
                href={`/clients/${client.id}`}
                variant="ghost"
                size="sm"
                className="text-slate-700"
              >
                Client settings
              </LinkButton>
            </div>
          </div>

          {saved ? (
            <Alert variant="success">
              {saved === "accepted"
                ? "Upload approved"
                : saved === "denied"
                ? "Upload denied"
                : "Saved"}{" "}
              ✅
            </Alert>
          ) : null}

          {error ? <Alert variant="error">{error}</Alert> : null}

          {/* Upload list */}
          <ul className="space-y-3">
            {uploads.map((u) => {
              const isNew = !u.viewed_at;
              const viewHref = `/inbox/${sessionId}/${u.id}`;

              return (
                <li key={u.id}>
                  <Card>
                    <CardHeader className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-semibold text-slate-900">
                            {u.original_filename}
                          </div>
                          {isNew ? <Pill tone="warning">New</Pill> : null}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          Uploaded {fmt(u.uploaded_at)}
                          {u.size_bytes != null ? (
                            <span className="ml-2">
                              · {u.size_bytes.toLocaleString()} bytes
                            </span>
                          ) : null}
                          {u.mime_type ? (
                            <span className="ml-2">· {u.mime_type}</span>
                          ) : null}
                        </div>
                      </div>

                      <LinkButton href={viewHref} prefetch={false} size="sm">
                        View
                      </LinkButton>
                    </CardHeader>

                    <CardContent className="text-xs text-slate-500">
                      Opening “View” marks this upload as seen.
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    );
  }

  /* ───────────────────────── Review complete ───────────────────────── */

  const summary = await getSessionReviewSummary(sessionId);

  return (
    <main className="p-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">
            Review complete
          </h1>
          <div className="text-sm text-slate-600">
            Client{" "}
            <span className="font-medium text-slate-900">
              {summary.client.name}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            Session <span className="font-mono">{summary.session.id}</span> ·
            Status <Pill tone="success">{summary.session.status}</Pill>
          </div>

          <div className="flex gap-2 pt-2">
            <LinkButton href="/inbox" variant="secondary" size="sm">
              Back to inbox
            </LinkButton>
            <LinkButton
              href={`/clients/${summary.client.id}`}
              variant="ghost"
              size="sm"
              className="text-slate-700"
            >
              Client settings
            </LinkButton>
          </div>
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <Card>
          <CardContent className="text-sm">
            Accepted{" "}
            <span className="font-medium">{summary.accepted.length}</span> ·
            Denied <span className="font-medium">{summary.denied.length}</span>
          </CardContent>
        </Card>

        {/* Accepted */}
        <div className="space-y-2">
          <h2 className="font-medium">Accepted</h2>
          {summary.accepted.length === 0 ? (
            <div className="text-sm text-slate-600">None</div>
          ) : (
            <ul className="space-y-2">
              {summary.accepted.map((u) => (
                <li key={u.upload_id}>
                  <Card>
                    <CardHeader className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {u.document_title}
                        </div>
                        <div className="text-sm text-slate-600 truncate">
                          {u.original_filename}
                        </div>
                        <div className="text-xs text-slate-500">
                          {expiresInLabel(u.delete_after_at)}
                        </div>
                      </div>

                      <LinkButton
                        href={`/inbox/${sessionId}/${u.upload_id}`}
                        prefetch={false}
                        size="sm"
                      >
                        View
                      </LinkButton>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Denied */}
        <div className="space-y-2">
          <h2 className="font-medium">Denied</h2>
          {summary.denied.length === 0 ? (
            <div className="text-sm text-slate-600">None</div>
          ) : (
            <ul className="space-y-2">
              {summary.denied.map((u) => (
                <li key={u.upload_id}>
                  <Card>
                    <CardHeader className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {u.document_title}
                        </div>
                        <div className="text-sm text-slate-600 truncate">
                          {u.original_filename}
                        </div>
                      </div>

                      <LinkButton
                        href={`/inbox/${sessionId}/${u.upload_id}`}
                        prefetch={false}
                        size="sm"
                      >
                        View
                      </LinkButton>
                    </CardHeader>

                    <CardContent>
                      <div className="text-sm text-red-700">
                        Reason: {u.denial_reason ?? "(none recorded)"}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        {summary.denied.length > 0 ? (
          <form
            action={requestReplacementsAction.bind(null, sessionId)}
            className="space-y-2"
          >
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="send_email_now" value="1" />
              Send replacement link email to client now
            </label>

            <Button variant="primary">
              Request replacements for denied files
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
