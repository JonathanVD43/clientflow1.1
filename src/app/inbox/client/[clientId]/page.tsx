// src/app/inbox/client/[clientId]/page.tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { assertUuid } from "@/lib/validation/uuid";
import {
  listReviewSessionsForClient,
  listApprovedSessionsForClient,
  type ClientReviewSessionRow,
  type ClientApprovedSessionRow,
} from "@/lib/db/uploads";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { Alert } from "@/components/ui/alert";

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function expiresInLabel(deleteAfter: string | null) {
  if (!deleteAfter) return "—";
  const ms = new Date(deleteAfter).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "expired";

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);

  if (days > 0) return `expires in ${days}d ${hours}h`;
  return `expires in ${hours}h`;
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

export default async function InboxClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<{ view?: string }>;
}) {
  const { clientId } = await params;

  try {
    assertUuid("clientId", clientId);
  } catch {
    return (
      <main className="p-6">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-semibold text-slate-900">
                Invalid client
              </h1>
              <p className="text-sm text-slate-600">
                This doesn’t look like a valid UUID:{" "}
                <span className="font-mono text-slate-900">{clientId}</span>
              </p>
            </CardHeader>
            <CardContent>
              <LinkButton href="/inbox" variant="secondary" size="sm">
                Back to inbox
              </LinkButton>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const sp = (await searchParams) ?? {};
  const view = (sp.view ?? "pending").toLowerCase();
  const showApproved = view === "approved";

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
      <main className="p-6">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <Card>
            <CardHeader>
              <h1 className="text-2xl font-semibold text-slate-900">Inbox</h1>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert variant="error">
                Failed to load client: {cErr.message}
              </Alert>
              <LinkButton href="/inbox" variant="secondary" size="sm">
                Back to inbox
              </LinkButton>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const pendingSessions: ClientReviewSessionRow[] = showApproved
    ? []
    : await listReviewSessionsForClient(clientId);

  const approvedSessions: ClientApprovedSessionRow[] = showApproved
    ? await listApprovedSessionsForClient(clientId)
    : [];

  return (
    <main className="p-6">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              Client inbox
            </h1>

            <div className="text-sm text-slate-600">
              Client:{" "}
              <span className="font-medium text-slate-900">
                {client?.name ?? "(unnamed)"}
              </span>
              {client?.email ? (
                <span className="ml-2 text-slate-500">· {client.email}</span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <LinkButton href="/inbox" variant="secondary" size="sm">
                Back
              </LinkButton>
              <LinkButton
                href={`/clients/${clientId}`}
                variant="ghost"
                size="sm"
                className="text-slate-700"
              >
                Client settings
              </LinkButton>
            </div>
          </div>

          <Segmented
            value={showApproved ? "approved" : "pending"}
            pendingHref={`/inbox/client/${clientId}?view=pending`}
            approvedHref={`/inbox/client/${clientId}?view=approved`}
          />
        </div>

        {/* Pending view */}
        {!showApproved ? (
          pendingSessions.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-slate-600">
                No sessions currently have pending uploads for review.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {pendingSessions.map((s: ClientReviewSessionRow) => {
                const href = `/inbox/${s.session_id}`;
                const hasNew = Number(s.pending_new ?? 0) > 0;

                return (
                  <li key={`pending-${s.session_id}`}>
                    <Card>
                      <CardHeader className="flex flex-row items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-slate-900">
                              Session
                            </div>
                            <span className="truncate text-xs font-mono text-slate-500">
                              {s.session_id}
                            </span>
                            {hasNew ? (
                              <Pill tone="warning">{s.pending_new} new</Pill>
                            ) : null}
                          </div>

                          <div className="mt-1 text-sm text-slate-700">
                            Pending:{" "}
                            <span className="font-medium text-slate-900">
                              {s.pending_total ?? 0}
                            </span>
                            <span className="ml-2 text-slate-500">
                              · status: {s.status}
                            </span>
                          </div>
                        </div>

                        <LinkButton href={href} prefetch={false} size="sm">
                          Open
                        </LinkButton>
                      </CardHeader>

                      <CardContent className="text-xs text-slate-500">
                        Opened: {fmt(s.opened_at)} · Last upload:{" "}
                        {fmt(s.last_uploaded_at)}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}

        {/* Approved view */}
        {showApproved ? (
          approvedSessions.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-sm text-slate-600">
                No approved sessions currently have downloadable files within
                the 72h window.
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {approvedSessions.map((s: ClientApprovedSessionRow) => {
                const href = `/inbox/${s.session_id}`;

                return (
                  <li key={`approved-${s.session_id}`}>
                    <Card>
                      <CardHeader className="flex flex-row items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-slate-900">
                              Session
                            </div>
                            <span className="truncate text-xs font-mono text-slate-500">
                              {s.session_id}
                            </span>
                          </div>

                          <div className="mt-1 text-sm text-slate-700">
                            Approved files:{" "}
                            <span className="font-medium text-slate-900">
                              {s.accepted_total ?? 0}
                            </span>
                            <span className="ml-2 text-slate-500">
                              · status: {s.status}
                            </span>
                          </div>
                        </div>

                        <LinkButton href={href} prefetch={false} size="sm">
                          Open
                        </LinkButton>
                      </CardHeader>

                      <CardContent className="text-xs text-slate-500">
                        Last approved: {fmt(s.last_reviewed_at)} ·{" "}
                        {s.expires_at ? expiresInLabel(s.expires_at) : "—"}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>
    </main>
  );
}
