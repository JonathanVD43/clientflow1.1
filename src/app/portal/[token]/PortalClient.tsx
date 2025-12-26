// src/app/portal/[token]/PortalClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { uploadFile } from "./upload";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

type PortalDoc = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  active: boolean;
  sort_order: number;
  max_files: number;
  allowed_mime_types: string[] | null;

  // provided by /api/portal-session/[token]/info
  submitted: boolean;
};

type PortalSession = {
  id: string;
  opened_at: string | null;
};

type PortalInfoOk = {
  session: PortalSession;
  client: {
    id: string;
    name: string;
    due_day_of_month: number | null;
    due_timezone: string | null;
  };
  documents: PortalDoc[];
};

type PortalInfoErr = { error: string };
type PortalInfo = PortalInfoOk | PortalInfoErr;

function isInfoOk(x: PortalInfo): x is PortalInfoOk {
  return (
    typeof x === "object" &&
    x !== null &&
    "client" in x &&
    "documents" in x &&
    Array.isArray((x as { documents?: unknown }).documents)
  );
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success";
}) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";
  const styles =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : "border-slate-200 bg-white text-slate-700";
  return <span className={`${base} ${styles}`}>{children}</span>;
}

function UploadLabelButton({
  disabled,
  variant,
  children,
}: {
  disabled: boolean;
  variant: "primary" | "secondary";
  children: React.ReactNode;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium transition active:scale-[0.99] whitespace-nowrap select-none";

  const styles =
    variant === "primary"
      ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
      : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50";

  const disabledStyles = disabled ? "opacity-50 pointer-events-none" : "";

  return (
    <span className={`${base} ${styles} px-4 py-2 ${disabledStyles}`}>
      {children}
    </span>
  );
}

export default function PortalClient({ token }: { token: string }) {
  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [ok, setOk] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});

  async function loadInfo(signal?: AbortSignal) {
    const res = await fetch(`/api/portal-session/${token}/info`, {
      method: "GET",
      cache: "no-store",
      signal,
    });

    const json = (await res.json()) as PortalInfo;
    setInfo(json);
  }

  useEffect(() => {
    const ac = new AbortController();

    (async () => {
      setLoading(true);
      try {
        await loadInfo(ac.signal);
      } catch {
        if (!ac.signal.aborted) setInfo({ error: "Failed to load portal" });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [token]);

  const header = useMemo(() => {
    if (!info) return null;
    if (!isInfoOk(info)) return null;
    return info.client;
  }, [info]);

  async function onPickFile(docId: string, file: File) {
    setOk((p) => ({ ...p, [docId]: "" }));
    setErr((p) => ({ ...p, [docId]: "" }));
    setBusy((p) => ({ ...p, [docId]: true }));

    try {
      await uploadFile(token, file, docId);
      setOk((p) => ({ ...p, [docId]: "Uploaded successfully ✅" }));

      try {
        await loadInfo();
      } catch {
        // best-effort; upload already succeeded
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setErr((p) => ({ ...p, [docId]: msg }));
    } finally {
      setBusy((p) => ({ ...p, [docId]: false }));
    }
  }

  return (
    <main className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">Client portal</h1>
        <p className="text-sm text-slate-600">
          Upload the requested documents below.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-4 text-sm text-slate-600">
            Loading…
          </CardContent>
        </Card>
      ) : !info ? (
        <Alert variant="error">Could not load portal.</Alert>
      ) : "error" in info ? (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold text-red-700">
              Access error
            </div>
            <div className="text-sm text-slate-600">{info.error}</div>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-0">
              <div className="text-sm font-semibold text-slate-900">
                {header?.name}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Due day: {header?.due_day_of_month ?? "—"}{" "}
                <span className="opacity-70">
                  ({header?.due_timezone ?? "—"})
                </span>
                {" · "}Session{" "}
                <span className="font-mono">{info.session.id}</span>
                {info.session.opened_at ? (
                  <>
                    {" · "}Opened {fmt(info.session.opened_at)}
                  </>
                ) : null}
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {info.documents.length === 0 ? (
                <div className="text-sm text-slate-600">
                  No document requests have been configured for this request
                  link.
                </div>
              ) : (
                <ul className="space-y-3">
                  {info.documents.map((d) => {
                    const isDone = d.submitted || !!ok[d.id];
                    const isBusy = !!busy[d.id];
                    const disabled = isBusy || isDone;

                    const labelVariant: "primary" | "secondary" = isDone
                      ? "secondary"
                      : "primary";

                    return (
                      <li key={d.id}>
                        <Card className="border-slate-200">
                          <CardHeader className="flex flex-row items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="truncate text-base font-semibold text-slate-900">
                                  {d.title}
                                </div>

                                {d.required ? (
                                  <Pill>Required</Pill>
                                ) : (
                                  <Pill>Optional</Pill>
                                )}
                                {d.submitted ? (
                                  <Pill tone="success">Submitted ✅</Pill>
                                ) : null}
                              </div>

                              {d.description ? (
                                <div className="mt-1 text-sm text-slate-600">
                                  {d.description}
                                </div>
                              ) : null}

                              <div className="mt-1 text-xs text-slate-500">
                                {d.allowed_mime_types?.length ? (
                                  <>
                                    Allowed: {d.allowed_mime_types.join(", ")}
                                  </>
                                ) : (
                                  <>Allowed: any file type (v1)</>
                                )}
                              </div>
                            </div>

                            {/* ✅ Clickable file input (label styled as button) */}
                            <label
                              className={
                                disabled
                                  ? "cursor-not-allowed"
                                  : "cursor-pointer"
                              }
                            >
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  e.currentTarget.value = "";
                                  onPickFile(d.id, f);
                                }}
                                disabled={disabled}
                              />

                              <UploadLabelButton
                                disabled={disabled}
                                variant={labelVariant}
                              >
                                {isBusy
                                  ? "Uploading…"
                                  : isDone
                                  ? "Submitted"
                                  : "Choose file"}
                              </UploadLabelButton>
                            </label>
                          </CardHeader>

                          {ok[d.id] || err[d.id] ? (
                            <CardContent className="pt-0">
                              {ok[d.id] ? (
                                <Alert variant="success">{ok[d.id]}</Alert>
                              ) : null}
                              {err[d.id] ? (
                                <div className="mt-2">
                                  <Alert variant="error">{err[d.id]}</Alert>
                                </div>
                              ) : null}
                            </CardContent>
                          ) : null}
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="text-xs text-slate-500">
            Tip: If a file is denied later, you’ll receive a new upload link for
            only those files.
          </div>
        </>
      )}
    </main>
  );
}
