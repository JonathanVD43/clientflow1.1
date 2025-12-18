import Link from "next/link";
import { listPendingUploadsForSession } from "@/lib/db/uploads";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export default async function InboxSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

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

  const { client, session, uploads } = await listPendingUploadsForSession(
    sessionId
  );

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="text-xs font-mono opacity-60">
        BUILD MARKER: INBOX_SESSION_PAGE_V2
      </div>

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

      {uploads.length === 0 ? (
        <div className="opacity-70">No pending uploads in this session.</div>
      ) : (
        <ul className="space-y-2">
          {uploads.map((u) => {
            const isNew = !u.viewed_at;
            const viewHref = `/inbox/${sessionId}/${u.id}`;

            return (
              <li key={u.id} className="border rounded-xl p-4 space-y-2">
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
      )}
    </main>
  );
}
