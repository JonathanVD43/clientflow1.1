import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { listInboxSessions, type InboxSessionRow } from "@/lib/db/uploads";

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export default async function InboxPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sessions = await listInboxSessions();

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Inbox</h1>
          <div className="text-xs font-mono opacity-60">
            signed in as: {user?.email ?? "(unknown)"} ({user?.id ?? "no-user"})
          </div>
          <div className="flex gap-3 text-sm">
            <Link className="underline" href="/clients">Clients</Link>
            <Link className="underline" href="/logout">Logout</Link>
          </div>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="opacity-70">No pending uploads yet.</div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s: InboxSessionRow) => (
            <li key={s.session_id} className="border rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="font-medium truncate">{s.client_name}</div>
                  {s.client_email ? (
                    <div className="text-sm opacity-70 truncate">{s.client_email}</div>
                  ) : null}

                  <div className="text-sm opacity-70">
                    Pending uploads: {s.pending_count}
                    {s.new_count > 0 ? (
                      <span className="ml-2 text-xs border rounded-full px-2 py-0.5">
                        {s.new_count} new
                      </span>
                    ) : null}
                  </div>

                  <div className="text-xs opacity-60">
                    Last upload: {fmt(s.last_uploaded_at)}
                  </div>
                </div>

                <Link className="underline shrink-0" href={`/inbox/${s.session_id}`} prefetch={false}>
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
