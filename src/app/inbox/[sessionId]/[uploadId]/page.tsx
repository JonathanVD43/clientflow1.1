import Link from "next/link";
import { getUpload, markUploadViewed } from "@/lib/db/uploads";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPreviewable(mime: string | null) {
  if (!mime) return false;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("text/")) return true;
  return false;
}

export default async function UploadViewPage({
  params,
}: {
  params: Promise<{ sessionId: string; uploadId: string }>;
}) {
  const { sessionId, uploadId } = await params;

  if (!UUID_RE.test(sessionId) || !UUID_RE.test(uploadId)) {
    return (
      <main className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Invalid link</h1>
        <Link className="underline" href="/inbox">
          Back to inbox
        </Link>
      </main>
    );
  }

  // Mark as viewed (idempotent)
  await markUploadViewed(uploadId);

  const upload = await getUpload(uploadId);
  const previewable = isPreviewable(upload.mime_type ?? null);

  const previewSrc = `/api/inbox/uploads/${uploadId}/preview`;

  return (
    <main className="p-6 max-w-4xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">View upload</h1>
        <div className="text-sm opacity-70">
          {upload.original_filename}{" "}
          {upload.mime_type ? <span>· {upload.mime_type}</span> : null}
        </div>

        <div className="flex gap-3 text-sm pt-1">
          <Link className="underline" href={`/inbox/${sessionId}`}>
            Back to session
          </Link>
          <Link className="underline" href="/inbox">
            Inbox
          </Link>
        </div>
      </div>

      {!previewable ? (
        <div className="border rounded-xl p-4 space-y-2">
          <div className="font-medium">Preview not available</div>
          <div className="text-sm opacity-70">
            For safety, we only preview PDFs, images, and text.
          </div>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <iframe
            title="Preview"
            src={previewSrc}
            className="w-full"
            style={{ height: "80vh" }}
          />
        </div>
      )}
    </main>
  );
}
