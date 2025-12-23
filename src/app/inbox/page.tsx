// src/app/inbox/page.tsx
import Link from "next/link";
import {
  listInboxSessions,
  listApprovedInboxSessions,
  type InboxSessionRow,
  type ApprovedInboxSessionRow,
} from "@/lib/db/uploads";

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function expiresInLabel(expiresAt: string | null) {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "expired";

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);

  if (days > 0) return `expires in ${days}d ${hours}h`;
  return `expires in ${hours}h`;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const view = sp.view === "approved" ? "approved" : "pending";

  const pendingSessions: InboxSessionRow[] =
    view === "pending" ? await listInboxSessions() : [];

  const approvedSessions: ApprovedInboxSessionRow[] =
    view === "approved" ? await listApprovedInboxSessions() : [];

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Inbox</h1>
          <div className="text-sm opacity-70">
            {view === "pending"
              ? "Sessions with pending uploads"
              : "Completed sessions with approved files (available for 72h)"}
          </div>

          <div className="flex gap-3 text-sm pt-1">
            <Link className="underline" href="/clients">
              Clients
            </Link>
          </div>

          <div className="flex gap-3 text-sm pt-3">
            <Link
              className={view === "pending" ? "underline font-medium" : "underline"}
              href="/inbox"
              prefetch={false}
            >
              Pending
            </Link>

            <Link
              className={view === "approved" ? "underline font-medium" : "underline"}
              href="/inbox?view=approved"
              prefetch={false}
            >
              Approved (72h)
            </Link>
          </div>
        </div>
      </div>

      {view === "pending" ? (
        pendingSessions.length === 0 ? (
          <div className="opacity-70">No pending uploads.</div>
        ) : (
          <ul className="space-y-2">
            {pendingSessions.map((s) => {
              const clientName = s.client?.name ?? "(unnamed client)";
              const clientEmail = s.client?.email ?? null;

              return (
                <li key={`pending-${s.session_id}`} className="border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="font-medium truncate flex items-center gap-2">
                        <span className="truncate">{clientName}</span>

                        {s.pending_new > 0 ? (
                          <span className="text-xs border rounded-full px-2 py-0.5">
                            {s.pending_new} new
                          </span>
                        ) : null}
                      </div>

                      {clientEmail ? (
                        <div className="text-sm opacity-70 truncate">{clientEmail}</div>
                      ) : null}

                      <div className="text-sm opacity-70">
                        Pending: {s.pending_total}
                      </div>

                      <div className="text-xs opacity-60">
                        Session: <span className="font-mono">{s.session_id}</span>
                        {" · "}Opened: {fmt(s.session?.opened_at ?? null)}
                        {" · "}Last upload: {fmt(s.last_uploaded_at)}
                      </div>

                      <div className="flex gap-3 text-sm pt-2">
                        <Link
                          className="underline"
                          href={`/inbox/${s.session_id}`}
                          prefetch={false}
                        >
                          Open session
                        </Link>
                        <Link
                          className="underline"
                          href={`/clients/${s.client_id}`}
                          prefetch={false}
                        >
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
              );
            })}
          </ul>
        )
      ) : approvedSessions.length === 0 ? (
        <div className="opacity-70">
          No completed sessions with approved files are currently available.
        </div>
      ) : (
        <ul className="space-y-2">
          {approvedSessions.map((s) => {
            const clientName = s.client?.name ?? "(unnamed client)";
            const clientEmail = s.client?.email ?? null;

            return (
              <li key={`approved-${s.session_id}`} className="border rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium truncate">{clientName}</div>

                    {clientEmail ? (
                      <div className="text-sm opacity-70 truncate">{clientEmail}</div>
                    ) : null}

                    <div className="text-sm opacity-70">
                      Approved: {s.accepted_total}
                      {s.session?.status ? (
                        <span className="ml-2">· Session status: {s.session.status}</span>
                      ) : null}
                    </div>

                    <div className="text-xs opacity-60">
                      Session: <span className="font-mono">{s.session_id}</span>
                      {" · "}Last approved: {fmt(s.last_reviewed_at)}
                      {" · "}{expiresInLabel(s.expires_at)}
                    </div>

                    <div className="flex gap-3 text-sm pt-2">
                      <Link
                        className="underline"
                        href={`/inbox/${s.session_id}`}
                        prefetch={false}
                      >
                        Open session
                      </Link>
                      <Link
                        className="underline"
                        href={`/clients/${s.client_id}`}
                        prefetch={false}
                      >
                        Client settings
                      </Link>
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
            );
          })}
        </ul>
      )}
    </main>
  );
}
