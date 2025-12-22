"use client";

import { useEffect, useState } from "react";

type ViewUrlOk = {
  signedUrl: string;
  mime_type: string | null;
  filename: string | null;
  download?: boolean;
};

type ViewUrlErr = { error: string };

function isOk(x: unknown): x is ViewUrlOk {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { signedUrl?: unknown }).signedUrl === "string"
  );
}

export default function PreviewFrame({ uploadId }: { uploadId: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setErr(null);
        setSignedUrl(null);

        const res = await fetch(`/api/inbox/uploads/${uploadId}/view-url?download=0`, {
          method: "GET",
          cache: "no-store",
        });

        const json = (await res.json()) as unknown;

        if (!res.ok) {
          const msg =
            typeof json === "object" &&
            json !== null &&
            typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : `Failed to load preview (${res.status})`;
          if (!cancelled) setErr(msg);
          return;
        }

        if (!isOk(json)) {
          if (!cancelled) setErr("Invalid response from preview endpoint");
          return;
        }

        if (!cancelled) setSignedUrl(json.signedUrl);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load preview";
        if (!cancelled) setErr(msg);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [uploadId]);

  if (err) {
    return (
      <div className="border rounded-xl p-4 space-y-2">
        <div className="font-medium text-red-700">Preview failed</div>
        <div className="text-sm opacity-70">{err}</div>
      </div>
    );
  }

  if (!signedUrl) {
    return <div className="opacity-70">Loading preview…</div>;
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      <iframe title="Preview" src={signedUrl} className="w-full" style={{ height: "80vh" }} />
    </div>
  );
}
