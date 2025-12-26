// src/app/clients/page.tsx
// Clients list page
import { supabaseServer } from "@/lib/supabase/server";
import { listClientsWithProgress } from "@/lib/db/clients";
import { listClientIdsWithUnseenPendingUploads } from "@/lib/db/uploads";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

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

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "danger";
}) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

  const styles =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "danger"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-white text-slate-700";

  return <span className={`${base} ${styles}`}>{children}</span>;
}

export default async function ClientsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const clients = await listClientsWithProgress();
  const unseenSet = await listClientIdsWithUnseenPendingUploads();

  return (
    <main className="p-6">
      {/* Center column, but not too narrow */}
      <div className="mx-auto w-full max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>

            <div className="text-xs font-mono text-slate-500">
              signed in as: {user?.email ?? "(unknown)"} (
              {user?.id ?? "no-user"})
            </div>

            {/* ✅ changed: styled buttons instead of underlined links */}
            <div className="flex flex-wrap gap-2 pt-2">
              <LinkButton href="/inbox" variant="secondary" size="sm">
                Inbox
              </LinkButton>
              <LinkButton href="/logout" variant="secondary" size="sm">
                Logout
              </LinkButton>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LinkButton
              href="/clients/new"
              variant="primary"
              size="md"
              className="text-white"
            >
              Add client
            </LinkButton>
          </div>
        </div>

        {/* List */}
        {clients.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-slate-600">No clients yet.</div>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
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
                <li key={c.id}>
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-semibold text-slate-900">
                            {c.name}
                          </div>
                          {hasNew ? <Pill tone="warning">New</Pill> : null}
                          {!c.active ? (
                            <Pill tone="danger">Inactive</Pill>
                          ) : null}
                        </div>

                        {c.email ? (
                          <div className="mt-1 truncate text-sm text-slate-600">
                            {c.email}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-slate-500">
                            No email
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <LinkButton
                          href={`/inbox/client/${c.id}`}
                          prefetch={false}
                          variant="secondary"
                          size="sm"
                        >
                          Open inbox
                        </LinkButton>

                        <LinkButton
                          href={`/clients/${c.id}`}
                          prefetch={false}
                          variant="secondary"
                          size="sm"
                        >
                          Manage
                        </LinkButton>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-slate-600">Documents</div>
                        <div className="font-medium text-slate-900">
                          {received}/{total}
                        </div>
                      </div>

                      <div className="h-px bg-slate-100" />

                      <div className="flex items-center justify-between gap-3">
                        <div className="text-slate-600">Next due</div>
                        <div className="font-medium text-slate-900">
                          {nextDue}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
