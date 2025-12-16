import Link from "next/link";
import { listClientsAsDevOwner } from "@/lib/db/clients";

export default async function ClientsPage() {
  const clients = await listClientsAsDevOwner();

  console.log("CLIENTS ROWS:", clients);

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        <Link className="underline" href="/clients/new">
          Add client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="opacity-70">No clients yet.</div>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => {
            const href = c?.id ? `/clients/${c.id}` : "/clients/undefined";

            return (
              <li
                key={c.id ?? `missing-${c.name}`}
                className="border rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    {c.email ? (
                      <div className="text-sm opacity-70">{c.email}</div>
                    ) : null}

                    {!c.id ? (
                      <div className="text-sm text-red-600">
                        Missing id! (this row should never exist)
                      </div>
                    ) : null}

                    <div className="text-xs font-mono opacity-60">
                      href: {href}
                    </div>
                  </div>

                  {c.id ? (
                    <Link className="underline" href={href} prefetch={false}>
                      Open
                    </Link>
                  ) : (
                    <span className="opacity-50">Open</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
