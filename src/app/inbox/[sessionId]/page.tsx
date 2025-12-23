// src/app/inbox/[sessionId]/page.tsx
import Link from "next/link";
import {
  listPendingUploadsForSession,
  getSessionReviewSummary,
} from "@/lib/db/uploads";
import { requestReplacementsAction } from "./actions";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function statusBadge(status: string) {
  const base = "text-xs border rounded-full px-2 py-0.5";
  if (status === "PENDING") return <span className={base}>Pending</span>;
  if (status === "ACCEPTED")
    return <span className={`${base} text-green-700`}>Accepted</span>;
  if (status === "DENIED")
    return <span className={`${base} text-red-700`}>Denied</span>;
  return <span className={`${base} opacity-70`}>{status}</span>;
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
      <main className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Invalid session</h1>
        <p className="opacity-70">
          This doesn’t look like a valid UUID:{" "}
          <span className="font-mono">{sessionId}</span>
        </p>
        <Link className="underline" href="/inbox">
          Back to inbox
        </Link>
      </main>
    );
  }

  // Keep your existing “pending queue” behavior
  const pendingBundle = await listPendingUploadsForSession(sessionId);

  const hasPending = pendingBundle.uploads.length > 0;

  if (hasPending) {
    const { client, session, uploads } = pendingBundle;

    return (
      <main className="p-6 max-w-2xl space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Review queue</h1>
          <div className="text-sm opacity-70">
            Client: <span className="font-medium">{client.name}</span>
          </div>
          <div className="text-xs opacity-60">
            Session: <span className="font-mono">{session.id}</span> · Opened:{" "}
            {fmt(session.opened_at)}
          </div>

          <div className="flex gap-3 text-sm pt-1">
            <Link className="underline" href="/inbox">
              Back to inbox
            </Link>
            <Link className="underline" href={`/clients/${client.id}`}>
              Client settings
            </Link>
          </div>
        </div>

        {saved ? (
          <div className="border border-green-300 bg-green-50 text-green-800 rounded-lg p-3 text-sm">
            {saved === "accepted"
              ? "Upload approved ✅"
              : saved === "denied"
              ? "Upload denied ✅"
              : "Saved ✅"}
          </div>
        ) : null}

        {error ? (
          <div className="border border-red-300 bg-red-50 text-red-800 rounded-lg p-3 text-sm">
            {error}
          </div>
        ) : null}

        <ul className="space-y-2">
          {uploads.map((u) => {
            const isNew = !u.viewed_at;
            const viewHref = `/inbox/${sessionId}/${u.id}`;

            return (
              <li
                key={`pending-${u.id}`}
                className="border rounded-xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span className="truncate">{u.original_filename}</span>

                      {isNew ? (
                        <span className="text-xs border rounded-full px-2 py-0.5">
                          New
                        </span>
                      ) : null}
                    </div>

                    <div className="text-xs opacity-60">
                      Uploaded: {fmt(u.uploaded_at)}
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

                  <Link
                    className="underline text-sm shrink-0"
                    href={viewHref}
                    prefetch={false}
                  >
                    View
                  </Link>
                </div>

                <div className="text-xs opacity-60">
                  Opening “View” marks it as seen automatically.
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    );
  }

  // ✅ No pending: show session summary
  const summary = await getSessionReviewSummary(sessionId);
  const deniedCount = summary.denied.length;
  const acceptedCount = summary.accepted.length;

  return (
    <main className="p-6 max-w-3xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Review complete</h1>
        <div className="text-sm opacity-70">
          Review complete for this request ·{" "}
          <span className="font-medium">{summary.client.name}</span>
        </div>
        <div className="text-xs opacity-60">
          Session: <span className="font-mono">{summary.session.id}</span> ·
          Status: {statusBadge(summary.session.status)}
        </div>

        <div className="flex gap-3 text-sm pt-1">
          <Link className="underline" href="/inbox">
            Back to inbox
          </Link>
          <Link className="underline" href={`/clients/${summary.client.id}`}>
            Client settings
          </Link>
        </div>
      </div>

      {error ? (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded-lg p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="border rounded-xl p-4 space-y-1">
        <div className="text-sm">
          Accepted: <span className="font-medium">{acceptedCount}</span> ·
          Denied: <span className="font-medium">{deniedCount}</span>
        </div>
        <div className="text-xs opacity-60">
          Accepted files remain downloadable until their expiry time.
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Accepted</h2>
        {summary.accepted.length === 0 ? (
          <div className="opacity-70 text-sm">None</div>
        ) : (
          <ul className="space-y-2">
            {summary.accepted.map((u) => (
              <li
                key={`accepted-${u.upload_id}`}
                className="border rounded-xl p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.document_title}</div>
                    <div className="text-sm opacity-70 truncate">
                      {u.original_filename}
                    </div>
                    <div className="text-xs opacity-60">
                      {u.delete_after_at ? expiresInLabel(u.delete_after_at) : "—"}
                    </div>
                  </div>

                  <Link
                    className="underline shrink-0"
                    href={`/inbox/${sessionId}/${u.upload_id}`}
                    prefetch={false}
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">Denied</h2>
        {summary.denied.length === 0 ? (
          <div className="opacity-70 text-sm">None</div>
        ) : (
          <ul className="space-y-2">
            {summary.denied.map((u) => (
              <li
                key={`denied-${u.upload_id}`}
                className="border rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.document_title}</div>
                    <div className="text-sm opacity-70 truncate">
                      {u.original_filename}
                    </div>
                  </div>

                  <Link
                    className="underline shrink-0"
                    href={`/inbox/${sessionId}/${u.upload_id}`}
                    prefetch={false}
                  >
                    View
                  </Link>
                </div>

                {u.denial_reason ? (
                  <div className="text-sm text-red-700">
                    Reason: <span className="opacity-90">{u.denial_reason}</span>
                  </div>
                ) : (
                  <div className="text-sm text-red-700">Reason: (none recorded)</div>
                )}
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

          <button className="border rounded-lg px-4 py-2">
            Request replacements for denied files
          </button>
        </form>
      ) : null}
    </main>
  );
}
