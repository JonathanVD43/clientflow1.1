import Link from "next/link";
import { listInboxClientsWithPendingCounts } from "@/lib/db/uploads";

export default async function InboxPage() {
  const rows = await listInboxClientsWithPendingCounts();

  // optional safety: only show clients that actually have pending uploads
  const pendingRows = rows.filter((r) => Number(r.pending_total ?? 0) > 0);

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <Link className="underline" href="/clients">
          Clients
        </Link>
      </div>

      {pendingRows.length === 0 ? (
        <div className="opacity-70">No pending uploads.</div>
      ) : (
        <ul className="space-y-2">
          {pendingRows.map((r) => (
            <li key={r.client_id} className="border rounded-xl p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {r.client?.name ?? "Client"}
                  </div>

                  {r.client?.email ? (
                    <div className="text-sm opacity-70 truncate">
                      {r.client.email}
                    </div>
                  ) : null}

                  <div className="text-sm opacity-70">
                    Pending: {r.pending_total ?? 0}
                    {Number(r.pending_new ?? 0) > 0 ? (
                      <span className="ml-2 text-xs border rounded-full px-2 py-0.5">
                        {r.pending_new} new
                      </span>
                    ) : null}
                  </div>
                </div>

                <Link
                  className="underline shrink-0"
                  href={`/inbox/client/${r.client_id}`}
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
