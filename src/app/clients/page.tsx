import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { listClientsWithProgress } from "@/lib/db/clients";
import { listClientIdsWithUnseenPendingUploads } from "@/lib/db/uploads";

function formatDDMMYYYY(d: Date) {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

// Returns a Date whose UTC components represent the Y-M-D in the target timezone
function nextDueDateInTimeZone(dueDay: number, timeZone: string) {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const year = Number(parts.year);
  const month1to12 = Number(parts.month);
  const day = Number(parts.day);

  function lastDayOfMonth(y: number, m1: number) {
    return new Date(Date.UTC(y, m1, 0)).getUTCDate();
  }

  function makeDate(y: number, m1: number, d: number) {
    const last = lastDayOfMonth(y, m1);
    const clamped = Math.min(d, last);
    return new Date(Date.UTC(y, m1 - 1, clamped, 0, 0, 0));
  }

  const candidate = makeDate(year, month1to12, dueDay);
  const today = makeDate(year, month1to12, day);

  if (candidate.getTime() < today.getTime()) {
    const nextMonth = month1to12 === 12 ? 1 : month1to12 + 1;
    const nextYear = month1to12 === 12 ? year + 1 : year;
    return makeDate(nextYear, nextMonth, dueDay);
  }

  return candidate;
}

export default async function ClientsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const clients = await listClientsWithProgress();
  const unseenSet = await listClientIdsWithUnseenPendingUploads();

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Clients</h1>

          <div className="text-xs font-mono opacity-60">
            signed in as: {user?.email ?? "(unknown)"} ({user?.id ?? "no-user"})
          </div>

          <div className="flex gap-3 text-sm pt-1">
            <Link className="underline" href="/inbox">
              Inbox
            </Link>

            <Link className="underline" href="/logout">
              Logout
            </Link>
          </div>
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
            const received = Number(c.required_received ?? 0);
            const total = Number(c.required_total ?? 0);
            const dueDay = Number(c.due_day_of_month ?? 25);

            const tz =
              typeof c.due_timezone === "string" && c.due_timezone.trim()
                ? c.due_timezone.trim()
                : "Africa/Johannesburg";

            let nextDue = "—";
            try {
              nextDue = formatDDMMYYYY(nextDueDateInTimeZone(dueDay, tz));
            } catch {
              nextDue = "—";
            }

            const hasNew = unseenSet.has(c.id);

            return (
              <li key={c.id} className="border rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span className="truncate">{c.name}</span>
                      {hasNew ? (
                        <span className="text-xs border rounded-full px-2 py-0.5">
                          New
                        </span>
                      ) : null}
                    </div>

                    {c.email ? (
                      <div className="text-sm opacity-70 truncate">{c.email}</div>
                    ) : null}

                    <div className="text-sm opacity-70">
                      Documents: {received}/{total} received
                    </div>

                    <div className="text-sm opacity-70">
                      Next due: {nextDue} (day {dueDay} · {tz})
                    </div>

                    {!c.active ? (
                      <div className="text-sm text-red-600">Inactive</div>
                    ) : null}
                  </div>

                  <Link
                    className="underline shrink-0"
                    href={`/clients/${c.id}`}
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
