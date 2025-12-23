"use client";

export default function PreviewFrame({ uploadId }: { uploadId: string }) {
  // ✅ same-origin preview endpoint (streams file from your app)
  const previewSrc = `/api/inbox/uploads/${uploadId}/preview`;

  return (
    <div className="border rounded-xl overflow-hidden">
      <iframe
        title="Preview"
        src={previewSrc}
        className="w-full"
        style={{ height: "80vh" }}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
