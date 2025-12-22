import Link from "next/link";
import { getUpload, markUploadViewed } from "@/lib/db/uploads";
import { acceptUploadAction, denyUploadAction } from "./actions";

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
  const previewSrc = `/api/inbox/uploads/${uploadId}/preview`;

  const isPending = upload.status === "PENDING";

  return (
    <main className="p-6 max-w-4xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">View upload</h1>

        <div className="flex flex-wrap items-center gap-2 text-sm opacity-80">
          <span className="font-medium">{upload.original_filename}</span>
          {upload.mime_type ? <span>· {upload.mime_type}</span> : null}
          {statusBadge(upload.status)}
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

      {saved ? (
        <div className="border border-green-300 bg-green-50 text-green-900 rounded-lg p-3 text-sm">
          {saved === "accepted"
            ? "Upload approved ✅"
            : saved === "denied"
            ? "Upload denied ✅"
            : "Saved ✅"}
        </div>
      ) : null}

      {error ? (
        <div className="border border-red-300 bg-red-50 text-red-900 rounded-lg p-3 text-sm">
          {error}
        </div>
      ) : null}

      {!isPending ? (
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
          <div className="font-medium">Review decision</div>

          <div className="flex flex-col gap-3">
            <form action={acceptUploadAction.bind(null, sessionId, uploadId)}>
              <button className="border rounded-lg px-4 py-2 w-full sm:w-auto">
                Approve
              </button>
            </form>

            <form
              action={denyUploadAction.bind(null, sessionId, uploadId)}
              className="space-y-2"
            >
              <label className="text-sm block">Denial reason (required)</label>
              <textarea
                name="denial_reason"
                className="w-full border rounded-lg p-2"
                rows={3}
                placeholder="Explain what’s wrong and what the client should re-upload…"
                required
              />
              <button className="border rounded-lg px-4 py-2 w-full sm:w-auto">
                Deny
              </button>
            </form>
          </div>

          <div className="text-xs opacity-60">
            Once you approve/deny, this file can’t be decided again (UI rule).
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
