import Link from "next/link";
import { getUpload, markUploadViewed } from "@/lib/db/uploads";
import { acceptUploadAction, denyUploadAction } from "./actions";

export default async function UploadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; uploadId: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { id: clientId, uploadId } = await params;
  const sp = (await searchParams) ?? {};
  const saved = sp.saved ?? null;

  const upload = await getUpload(uploadId);

  // ✅ mark as viewed the first time it's opened
  await markUploadViewed(uploadId);

  return (
    <main className="p-6 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Review upload</h1>
        <Link className="underline" href={`/clients/${clientId}/uploads`}>
          Back to uploads
        </Link>
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

      <div className="border rounded-xl p-4 space-y-2">
        <div className="font-medium">{upload.original_filename}</div>
        <div className="text-sm opacity-70">Status: {upload.status}</div>
        <div className="text-xs opacity-60">Uploaded: {upload.uploaded_at}</div>

        {/* File viewing comes next (signed URL). We'll wire it after you confirm bucket name. */}
        <div className="text-sm opacity-70">
          Storage key:{" "}
          <span className="font-mono break-all">{upload.storage_key}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <form action={acceptUploadAction.bind(null, clientId, upload.id)}>
          <button className="border rounded-lg px-4 py-2">Approve</button>
        </form>

        <form
          action={denyUploadAction.bind(null, clientId, upload.id)}
          className="flex-1"
        >
          <textarea
            name="denial_reason"
            className="w-full border rounded-lg p-2"
            rows={3}
            placeholder="Reason for denial (required)"
          />
          <button className="border rounded-lg px-4 py-2 mt-2">Deny</button>
        </form>
      </div>
    </main>
  );
}
