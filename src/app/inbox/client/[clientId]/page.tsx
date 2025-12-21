import Link from "next/link";
import { listReviewSessionsForClient } from "@/lib/db/uploads";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export default async function InboxClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  if (!UUID_RE.test(clientId)) {
    return (
      <main className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Invalid client</h1>
        <p className="opacity-70">
          This doesn’t look like a valid UUID:{" "}
          <span className="font-mono">{clientId}</span>
        </p>
        <Link className="underline" href="/inbox">
          Back to inbox
        </Link>
      </main>
    );
  }

  const sessions = await listReviewSessionsForClient(clientId);

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Review sessions</h1>
        <div className="flex gap-3 text-sm pt-1">
          <Link className="underline" href="/inbox">
            Back to inbox
          </Link>
          <Link className="underline" href={`/clients/${clientId}`}>
            Client settings
          </Link>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="opacity-70">No pending uploads for this client.</div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.session_id} className="border rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="font-medium">
                    Session{" "}
                    <span className="font-mono text-xs opacity-70">
                      {s.session_id}
                    </span>
                  </div>

                  <div className="text-sm opacity-70">
                    Status: {s.status} · Pending: {s.pending_total}
                    {s.pending_new > 0 ? (
                      <span className="ml-2 text-xs border rounded-full px-2 py-0.5">
                        {s.pending_new} new
                      </span>
                    ) : null}
                  </div>

                  <div className="text-xs opacity-60">
                    Opened: {fmt(s.opened_at)} · Finalized:{" "}
                    {fmt(s.finalized_at)}
                    {" · "}Last upload: {fmt(s.last_uploaded_at)}
                  </div>
                </div>

                <Link
                  className="underline text-sm shrink-0"
                  href={`/inbox/${s.session_id}`}
                  prefetch={false}
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
