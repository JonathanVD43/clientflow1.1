"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  uploadId: string;
  mimeType: string | null;
};

export default function PreviewPane({ uploadId, mimeType }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const kind = useMemo(() => {
    if (!mimeType) return "other";
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("text/")) return "text";
    return "other";
  }, [mimeType]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErr(null);
      setSignedUrl(null);

      try {
        const res = await fetch(`/api/inbox/uploads/${uploadId}/view-url`, {
          method: "GET",
          cache: "no-store",
        });

        const json = (await res.json()) as {
          signedUrl?: string;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to get view url");
        }

        if (!json?.signedUrl) {
          throw new Error("No signedUrl returned");
        }

        if (!cancelled) setSignedUrl(json.signedUrl);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load preview";
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
      <div className="p-4">
        <div className="font-medium text-red-600">Preview error</div>
        <div className="text-sm opacity-70">{err}</div>
      </div>
    );
  }

  if (!signedUrl) {
    return <div className="p-4 opacity-70">Loading preview…</div>;
  }

  // PDF + text: iframe is simplest
  if (kind === "pdf" || kind === "text") {
    return (
      <iframe
        src={signedUrl}
        className="w-full"
        style={{ height: "75vh" }}
        // sandbox keeps it tighter; allow-same-origin is needed for many PDF viewers
        sandbox="allow-same-origin allow-scripts allow-downloads"
      />
    );
  }

  if (kind === "image") {
    return (
      <div className="p-2">
        <img
          src={signedUrl}
          alt="Uploaded file preview"
          className="max-w-full h-auto"
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="font-medium">
        Preview not supported for this file type.
      </div>
      <div className="text-sm opacity-70">
        You can add a “download anyway” flow later.
      </div>
    </div>
  );
}
