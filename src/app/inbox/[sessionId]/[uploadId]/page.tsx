// src/app/inbox/[sessionId]/[uploadId]/page.tsx
import Link from "next/link";
import { getUpload, markUploadViewed } from "@/lib/db/uploads";
import { acceptUploadAction, denyUploadAction } from "./actions";
import PreviewFrame from "./PreviewFrame";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPreviewable(mime: string | null) {
  if (!mime) return false;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("text/")) return true;
  return false;
}

function statusBadge(status: "PENDING" | "ACCEPTED" | "DENIED") {
  const base = "text-xs border rounded-full px-2 py-0.5";
  if (status === "PENDING") return <span className={base}>Pending</span>;
  if (status === "ACCEPTED")
    return <span className={`${base} text-green-700`}>Accepted ✅</span>;
  return <span className={`${base} text-red-700`}>Denied ❌</span>;
}

export default async function UploadViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string; uploadId: string }>;
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  const { sessionId, uploadId } = await params;
  const sp = (await searchParams) ?? {};
  const saved = sp.saved ?? null;
  const error = sp.error ?? null;

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
  const canReview = upload.status === "PENDING";

  // Unified “download” entry point (server returns JSON with signedUrl)
  // For v1 UX we still link to the endpoint; later we can make a button that redirects to signedUrl.
  const downloadApiHref = `/api/inbox/uploads/${uploadId}/view-url?download=1`;

  return (
    <main className="p-6 max-w-4xl space-y-4">
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">View upload</h1>
            <div className="text-sm opacity-70 break-words">
              {upload.original_filename}{" "}
              {upload.mime_type ? <span>· {upload.mime_type}</span> : null}
            </div>
          </div>

          <div className="shrink-0 pt-1">{statusBadge(upload.status)}</div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm pt-1">
          <Link className="underline" href={`/inbox/${sessionId}`}>
            Back to session
          </Link>
          <Link className="underline" href="/inbox">
            Inbox
          </Link>

          {/* Download entrypoint */}
          <a className="underline" href={downloadApiHref}>
            Download
          </a>
        </div>
      </div>

      {saved ? (
        <div className="border border-green-300 bg-green-50 text-green-800 rounded-lg p-3 text-sm">
          {saved === "accepted"
            ? "Upload approved ✅"
            : saved === "denied"
            ? "Upload denied ✅"
            : "Saved ✅"}
        </div>
      ) : null}

      {error ? (
        <div className="border border-red-300 bg-red-50 text-red-800 rounded-lg p-3 text-sm">
          {error}
        </div>
      ) : null}

      {!canReview ? (
        <div className="border rounded-xl p-4 space-y-2">
          <div className="font-medium">This file has already been reviewed</div>
          <div className="text-sm opacity-70">
            Status: <span className="font-medium">{upload.status}</span>
          </div>
          {upload.status === "DENIED" && upload.denial_reason ? (
            <div className="text-sm">
              <div className="text-xs uppercase opacity-60">Denial reason</div>
              <div className="whitespace-pre-wrap">{upload.denial_reason}</div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="border rounded-xl p-4 space-y-3">
          <div className="font-medium">Review</div>

          <div className="flex flex-col sm:flex-row gap-3">
            <form action={acceptUploadAction.bind(null, sessionId, uploadId)}>
              <button className="border rounded-lg px-4 py-2">Approve</button>
            </form>

            <form
              action={denyUploadAction.bind(null, sessionId, uploadId)}
              className="flex-1 space-y-2"
            >
              <textarea
                name="denial_reason"
                className="w-full border rounded-lg p-2"
                rows={3}
                placeholder="Reason for denial (required)"
                required
              />
              <button className="border rounded-lg px-4 py-2">Deny</button>
            </form>
          </div>

          <div className="text-xs opacity-60">
            Once accepted/denied, you won’t be able to re-decide from this page.
          </div>
        </div>
      )}

      {!previewable ? (
        <div className="border rounded-xl p-4 space-y-2">
          <div className="font-medium">Preview not available</div>
          <div className="text-sm opacity-70">
            For safety, we only preview PDFs, images, and text.
          </div>
        </div>
      ) : (
        <PreviewFrame uploadId={uploadId} />
      )}
    </main>
  );
}
