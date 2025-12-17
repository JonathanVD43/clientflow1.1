import Link from "next/link";
import { listClients } from "@/lib/db/clients";
import { supabaseServer } from "@/lib/supabase/server";

export default async function ClientsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const clients = await listClients();

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Clients</h1>
          <div className="text-xs font-mono opacity-60">
            signed in as: {user?.email ?? "(unknown)"} ({user?.id ?? "no-user"})
          </div>
          <Link className="underline text-sm" href="/logout">
            Logout
          </Link>
        </div>

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
