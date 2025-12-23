"use client";

import { useMemo } from "react";

type Props = {
  uploadId: string;
  mimeType: string | null;
};

export default function PreviewPane({ uploadId, mimeType }: Props) {
  const kind = useMemo(() => {
    if (!mimeType) return "other";
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("text/")) return "text";
    return "other";
  }, [mimeType]);

  // ✅ same-origin preview endpoint (streams file from your app)
  const previewSrc = `/api/inbox/uploads/${uploadId}/preview`;

  // PDF + text: iframe is simplest (now same-origin)
  if (kind === "pdf" || kind === "text") {
    return (
      <iframe
        src={previewSrc}
        className="w-full"
        style={{ height: "75vh" }}
        referrerPolicy="no-referrer"
      />
    );
  }

  // Images: render <img> using same-origin URL
  if (kind === "image") {
    return (
      <div className="p-2">
        <img
          src={previewSrc}
          alt="Uploaded file preview"
          className="max-w-full h-auto"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="font-medium">Preview not supported for this file type.</div>
      <div className="text-sm opacity-70">
        You can add a “download anyway” flow later.
      </div>
    </div>
  );
}
