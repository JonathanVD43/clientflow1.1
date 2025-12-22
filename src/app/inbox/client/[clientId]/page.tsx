import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { assertUuid } from "@/lib/validation/uuid";
import { listReviewSessionsForClient, type ClientReviewSessionRow } from "@/lib/db/uploads";

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

  try {
    assertUuid("clientId", clientId);
  } catch {
    return (
      <main className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Invalid client</h1>
        <p className="opacity-70">
          This doesn’t look like a valid UUID: <span className="font-mono">{clientId}</span>
        </p>
        <Link className="underline" href="/inbox">
          Back to inbox
        </Link>
      </main>
    );
  }

  // Get client header info (name/email) for nice UX
  const { supabase, user } = await requireUser();
  const { data: client, error: cErr } = await supabase
    .from("clients")
    .select("id,name,email")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; name: string | null; email: string | null }>();

  if (cErr) {
    return (
      <main className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <div className="text-sm text-red-700">Failed to load client: {cErr.message}</div>
        <Link className="underline" href="/inbox">
          Back to inbox
        </Link>
      </main>
    );
  }

  const sessions: ClientReviewSessionRow[] = await listReviewSessionsForClient(clientId);

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Client review sessions</h1>

        <div className="text-sm opacity-70">
          Client:{" "}
          <span className="font-medium">
            {client?.name ?? "(unnamed)"}{" "}
            {client?.email ? <span className="opacity-70">· {client.email}</span> : null}
          </span>
        </div>

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
        <div className="opacity-70">No sessions currently have pending uploads for review.</div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s: ClientReviewSessionRow) => {
            const href = `/inbox/${s.session_id}`;
            const hasNew = Number(s.pending_new ?? 0) > 0;

            return (
              <li key={s.session_id} className="border rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span className="truncate">Session</span>
                      <span className="text-xs font-mono opacity-60 truncate">
                        {s.session_id}
                      </span>

                      {hasNew ? (
                        <span className="text-xs border rounded-full px-2 py-0.5">
                          {s.pending_new} new
                        </span>
                      ) : null}
                    </div>

                    <div className="text-sm opacity-70">
                      Pending: {s.pending_total ?? 0}
                      <span className="ml-2">· Session status: {s.status}</span>
                    </div>

                    <div className="text-xs opacity-60">
                      Opened: {fmt(s.opened_at)} · Last upload: {fmt(s.last_uploaded_at)}
                    </div>
                  </div>

                  <Link className="underline shrink-0" href={href} prefetch={false}>
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
