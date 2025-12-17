"use client";

import { useEffect, useMemo, useState } from "react";
import { uploadFile } from "./upload";

type PortalDoc = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  active: boolean;
  sort_order: number;
  max_files: number;
  allowed_mime_types: string[] | null;
};

type PortalInfo =
  | {
      client: {
        id: string;
        name: string;
        due_day_of_month: number;
        due_timezone: string;
      };
      documents: PortalDoc[];
    }
  | { error: string };

function isInfo(x: PortalInfo): x is Exclude<PortalInfo, { error: string }> {
  return (
    typeof (x as { client?: unknown }).client === "object" &&
    x !== null &&
    Array.isArray((x as { documents?: unknown }).documents)
  );
}

export default function PortalClient({ token }: { token: string }) {
  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [ok, setOk] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/portal/${token}/info`, {
          method: "GET",
          cache: "no-store",
        });
        const json: PortalInfo = await res.json();
        if (!cancelled) setInfo(json);
      } catch {
        if (!cancelled) setInfo({ error: "Failed to load portal" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const header = useMemo(() => {
    if (!info) return null;
    if (!isInfo(info)) return null;
    return info.client;
  }, [info]);

  async function onPickFile(docId: string, file: File) {
    setOk((p) => ({ ...p, [docId]: "" }));
    setErr((p) => ({ ...p, [docId]: "" }));
    setBusy((p) => ({ ...p, [docId]: true }));

    try {
      await uploadFile(token, file, docId);
      setOk((p) => ({ ...p, [docId]: "Uploaded successfully ✅" }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setErr((p) => ({ ...p, [docId]: msg }));
    } finally {
      setBusy((p) => ({ ...p, [docId]: false }));
    }
  }

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Client portal</h1>
        <p className="text-sm opacity-70">Upload the requested documents below.</p>
      </div>

      {loading ? (
        <div className="opacity-70">Loading…</div>
      ) : !info ? (
        <div className="text-sm text-red-600">Could not load portal.</div>
      ) : "error" in info ? (
        <div className="border rounded-xl p-4">
          <div className="font-medium text-red-600">Access error</div>
          <div className="text-sm opacity-70">{info.error}</div>
        </div>
      ) : (
        <>
          <div className="border rounded-xl p-4 space-y-1">
            <div className="font-medium">{header?.name}</div>
            <div className="text-sm opacity-70">
              Due day: {header?.due_day_of_month} ({header?.due_timezone})
            </div>
          </div>

          {info.documents.length === 0 ? (
            <div className="opacity-70">
              No document requests have been configured for this client.
            </div>
          ) : (
            <ul className="space-y-3">
              {info.documents.map((d) => (
                <li key={d.id} className="border rounded-xl p-4 space-y-3">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {d.title}{" "}
                      {d.required ? (
                        <span className="ml-2 text-xs border rounded-full px-2 py-0.5">
                          Required
                        </span>
                      ) : (
                        <span className="ml-2 text-xs border rounded-full px-2 py-0.5 opacity-70">
                          Optional
                        </span>
                      )}
                    </div>

                    {d.description ? (
                      <div className="text-sm opacity-70">{d.description}</div>
                    ) : null}

                    {d.allowed_mime_types?.length ? (
                      <div className="text-xs opacity-60">
                        Allowed: {d.allowed_mime_types.join(", ")}
                      </div>
                    ) : (
                      <div className="text-xs opacity-60">Allowed: any file type (v1)</div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="border rounded-lg px-4 py-2 cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          e.currentTarget.value = "";
                          onPickFile(d.id, f);
                        }}
                        disabled={!!busy[d.id]}
                      />
                      {busy[d.id] ? "Uploading…" : "Choose file"}
                    </label>

                    {ok[d.id] ? (
                      <span className="text-sm text-green-700">{ok[d.id]}</span>
                    ) : null}

                    {err[d.id] ? (
                      <span className="text-sm text-red-700">{err[d.id]}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="text-xs opacity-60">
            Tip: If a file is denied later, you’ll be asked to re-upload it here.
          </div>
        </>
      )}
    </main>
  );
}
