// src/app/inbox/page.tsx
import Link from "next/link";
import {
  listInboxSessions,
  listApprovedInboxSessions,
  type InboxSessionRow,
  type ApprovedInboxSessionRow,
} from "@/lib/db/uploads";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";

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

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";
  const styles =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-white text-slate-700";
  return <span className={`${base} ${styles}`}>{children}</span>;
}

function Segmented({
  value,
  pendingHref,
  approvedHref,
}: {
  value: "pending" | "approved";
  pendingHref: string;
  approvedHref: string;
}) {
  return (
    <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
      <Link
        href={pendingHref}
        prefetch={false}
        className={
          value === "pending"
            ? "rounded-lg bg-white px-3 py-1.5 font-medium text-slate-900 shadow-sm"
            : "rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:text-slate-900"
        }
      >
        Pending
      </Link>
      <Link
        href={approvedHref}
        prefetch={false}
        className={
          value === "approved"
            ? "rounded-lg bg-white px-3 py-1.5 font-medium text-slate-900 shadow-sm"
            : "rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:text-slate-900"
        }
      >
        Approved (72h)
      </Link>
    </div>
  );
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
    <main className="p-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">Inbox</h1>
            <div className="text-sm text-slate-600">
              {view === "pending"
                ? "Sessions with pending uploads"
                : "Completed sessions with approved files (available for 72h)"}
            </div>

            <div className="flex flex-wrap gap-3 pt-1 text-sm">
              <Link className="underline text-slate-700" href="/clients">
                Clients
              </Link>
            </div>
          </div>

          <Segmented
            value={view}
            pendingHref="/inbox"
            approvedHref="/inbox?view=approved"
          />
        </div>

        {/* Content */}
        {view === "pending" ? (
          pendingSessions.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-slate-600">
                No pending uploads.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {pendingSessions.map((s) => {
                const clientName = s.client?.name ?? "(unnamed client)";
                const clientEmail = s.client?.email ?? null;

                return (
                  <li key={`pending-${s.session_id}`}>
                    <Card>
                      <CardHeader className="flex flex-row items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-base font-semibold text-slate-900">
                              {clientName}
                            </div>

                            {s.pending_new > 0 ? (
                              <Pill tone="warning">{s.pending_new} new</Pill>
                            ) : null}
                          </div>

                          {clientEmail ? (
                            <div className="mt-1 truncate text-sm text-slate-600">
                              {clientEmail}
                            </div>
                          ) : (
                            <div className="mt-1 text-sm text-slate-500">
                              No email
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <LinkButton
                            href={`/inbox/${s.session_id}`}
                            prefetch={false}
                            size="sm"
                          >
                            Review
                          </LinkButton>

                          <LinkButton
                            href={`/clients/${s.client_id}`}
                            prefetch={false}
                            variant="ghost"
                            size="sm"
                            className="text-slate-700"
                          >
                            Settings
                          </LinkButton>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-2 text-sm text-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-slate-600">Pending</div>
                          <div className="font-medium text-slate-900">
                            {s.pending_total}
                          </div>
                        </div>

                        <div className="h-px bg-slate-100" />

                        <div className="text-xs text-slate-500">
                          <div className="truncate">
                            Session:{" "}
                            <span className="font-mono">{s.session_id}</span>
                          </div>
                          <div>
                            Opened: {fmt(s.session?.opened_at ?? null)} {" · "}
                            Last upload: {fmt(s.last_uploaded_at)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <LinkButton
                            href={`/inbox/${s.session_id}`}
                            prefetch={false}
                            variant="secondary"
                            size="sm"
                          >
                            Open session
                          </LinkButton>

                          <LinkButton
                            href={`/inbox/client/${s.client_id}`}
                            prefetch={false}
                            variant="ghost"
                            size="sm"
                            className="text-slate-700"
                          >
                            Client inbox
                          </LinkButton>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        ) : approvedSessions.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-slate-600">
              No completed sessions with approved files are currently available.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {approvedSessions.map((s) => {
              const clientName = s.client?.name ?? "(unnamed client)";
              const clientEmail = s.client?.email ?? null;

              return (
                <li key={`approved-${s.session_id}`}>
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-slate-900">
                          {clientName}
                        </div>

                        {clientEmail ? (
                          <div className="mt-1 truncate text-sm text-slate-600">
                            {clientEmail}
                          </div>
                        ) : (
                          <div className="mt-1 text-sm text-slate-500">
                            No email
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <LinkButton
                          href={`/inbox/${s.session_id}`}
                          prefetch={false}
                          size="sm"
                        >
                          Open
                        </LinkButton>

                        <LinkButton
                          href={`/clients/${s.client_id}`}
                          prefetch={false}
                          variant="ghost"
                          size="sm"
                          className="text-slate-700"
                        >
                          Settings
                        </LinkButton>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-slate-600">Approved</div>
                        <div className="font-medium text-slate-900">
                          {s.accepted_total}
                          {s.session?.status ? (
                            <span className="ml-2 font-normal text-slate-500">
                              · status: {s.session.status}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="h-px bg-slate-100" />

                      <div className="text-xs text-slate-500">
                        <div className="truncate">
                          Session:{" "}
                          <span className="font-mono">{s.session_id}</span>
                        </div>
                        <div>
                          Last approved: {fmt(s.last_reviewed_at)} {" · "}
                          {expiresInLabel(s.expires_at)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <LinkButton
                          href={`/inbox/${s.session_id}`}
                          prefetch={false}
                          variant="secondary"
                          size="sm"
                        >
                          Open session
                        </LinkButton>

                        <LinkButton
                          href={`/inbox/client/${s.client_id}`}
                          prefetch={false}
                          variant="ghost"
                          size="sm"
                          className="text-slate-700"
                        >
                          Client inbox
                        </LinkButton>
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
