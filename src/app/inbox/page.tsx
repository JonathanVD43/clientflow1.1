// src/app/inbox/page.tsx
import Link from "next/link";
import { listInboxSessions } from "@/lib/db/uploads";

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  // Keep it consistent with your other pages
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export default async function InboxPage() {
  const sessions = await listInboxSessions();

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Inbox</h1>
          <div className="text-sm opacity-70">
            Sessions with pending uploads
          </div>

          <div className="flex gap-3 text-sm pt-1">
            <Link className="underline" href="/clients">
              Clients
            </Link>
          </div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="opacity-70">No pending uploads.</div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.session_id} className="border rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="font-medium truncate flex items-center gap-2">
                    <span className="truncate">{s.client_name}</span>

                    {s.new_count > 0 ? (
                      <span className="text-xs border rounded-full px-2 py-0.5">
                        {s.new_count} new
                      </span>
                    ) : null}
                  </div>

                  {s.client_email ? (
                    <div className="text-sm opacity-70 truncate">
                      {s.client_email}
                    </div>
                  ) : null}

                  <div className="text-sm opacity-70">
                    Pending: {s.pending_count}
                  </div>

                  <div className="text-xs opacity-60">
                    Session: <span className="font-mono">{s.session_id}</span>
                    {" · "}Opened: {fmt(s.opened_at)}
                    {" · "}Last upload: {fmt(s.last_uploaded_at)}
                  </div>

                  <div className="flex gap-3 text-sm pt-2">
                    <Link className="underline" href={`/inbox/${s.session_id}`} prefetch={false}>
                      Open session
                    </Link>
                    <Link className="underline" href={`/clients/${s.client_id}`} prefetch={false}>
                      Client settings
                    </Link>
                  </div>
                </div>

                <Link
                  className="underline text-sm shrink-0"
                  href={`/inbox/${s.session_id}`}
                  prefetch={false}
                >
                  Review
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
